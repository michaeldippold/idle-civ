/* ============================================================
   Idle Civ — prototype game logic (v6 save schema)
   Deliberately small. Tune the CONFIG block to change the feel.
   Content is authored as per-era manifests (STONE + deltas) compiled at
   load; the engine reads everything through active(). See tech.md.
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
  speeds: [1, 2, 4, 8, 12],    // simulation multipliers the header button cycles through.
                               // Integers only: speed is implemented as N ordinary steps per
                               // tick, not one big one -- see the loop in boot().
  // Per-resource base caps live on each era's resource list below, not here.
  storageAdd: 100,        // extra cap per storage building
  stoneToolsBonus: 0.08,  // flat additive bump to ALL gather multipliers from the Stone Tools upgrade
  bronzeToolsBonus: 0.15, // ditto, Bronze Tools -- stacks additively on top of Stone Tools
  ironToolsBonus: 0.22,   // ditto, Iron Tools -- the tool tiers stack additively forever
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
  campaignFoodCost: 30,        // provisions paid up front when a campaign marches
  plunderFraction: 0.4,        // share of each stock resource a victorious campaign carries home
  siegeWallBonus: 6,           // siege engines hit walls at this multiple of their strength
  wallRetreatLoss: 0.35,       // chance a failed breach costs one fighter (before armor)
  caravanRaidChance: 0.25,     // chance a caravan is lost en route while any warlike neighbor is Hostile
  hostileConflictMult: 1.5,    // home-raid frequency multiplier per Hostile warlike neighbor
  offlineCapHours: 4,
  saveKey: "idleCiv.v6",
};

// ---------- Eras: the manifest model ------------------------
// Each era is a MANIFEST: the complete set of resources, jobs, buildings,
// upgrades, units, events and hints that exist while that era is active, plus
// a handful of era-scoped values (display name, housing per hut, panel titles,
// raid types). The engine reads ALL content through active() -- nothing below
// the compiler ever touches STONE or BRONZE_DELTA directly. If something is
// not in the active manifest, it does not exist right now: it can't fire,
// can't render, can't be built. Absence IS removal.
//
// Eras after the first are authored as DELTAS against their parent
// (remove / override / add) and compiled into full manifests at load. What a
// delta doesn't mention, it inherits unchanged -- with one deliberate
// exception: the `events` and `hints` slates are declared wholesale in every
// era, never inherited, because a forgotten event should be a loud authoring
// decision, not a silent omission. (This bit us once: events tagged for the
// wrong era simply stopped firing, with no error, ever.)
//
// Ids are permanent across eras -- saves, icons and DOM nodes key off them.
// Names, descs, costs and everything else are era-facts that live in the
// manifest, which is how a Hut becomes a Stone House without becoming a
// different thing. See tech.md for the full contract.
const ERA_ORDER = ["stone", "bronze", "iron"];   // chronological; drives compilation and era comparisons

// ---------- Event library -----------------------------------
// Every event that exists in ANY era, keyed by id. Which of these are live is
// decided by each manifest's `events` slate -- there are no era tags here.
// Each entry is one of three shapes (see resolveEvents):
//   canFire(S)         -- deterministic, re-checked and fired repeatedly per
//                          tick while true. Currently unoccupied (population
//                          growth moved out to accrueGrowth) but the archetype
//                          stays: it's the generic deterministic shape.
//   chancePerSecond    -- probabilistic hazard/windfall, converted to a
//                          per-tick roll. If it lands, an optional `counter`
//                          (a building) gets a second roll to negate it.
//   resolve(S, dt)      -- full escape hatch: owns its own trigger roll,
//                          effect, and flavor logging. For events too
//                          multi-staged to fit the generic shape (Conflict).
// Plus: condition(S) gating, effect(S) (may return a custom log line), and
// flavor.{hit,negated} pools. Adding an event never touches the engine --
// only this library and the slates that name it.
const EVENT_LIB = {
  greatHunt: {
    sev: "good",
    chancePerSecond: 0.002,                         // ~8.3 real minutes average -- small, frequent
    effect: (S) => { S.res.food += Math.round(8 + S.pop * 1.2); },
    flavor: {
      hit: [
        "A hunting party returns with more than they hoped for -- there is meat enough to share.",
        "A lucky strike brings down a boar. The camp eats well tonight.",
      ],
    },
  },
  trader: {
    sev: "good",
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
  sickness: {
    sev: "bad",
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
  conflict: {
    sev: "bad",
    condition: (S) => S.pop >= 4,
    resolve: (S, dt) => {
      // hostilityMultiplier: every Hostile warlike neighbor raids you more.
      const chance = CONFIG.conflictBaseChance * (1 + S.pop * CONFIG.conflictPopScale) * hostilityMultiplier();
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
  scoutFind: {
    // Scouting unlocks a category of purely-positive discoveries. Gated on the
    // upgrade rather than the Stables, so building the Stables alone doesn't
    // hand it to you -- you have to actually invest in ranging out.
    sev: "good",
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
  scoutWarning: {
    sev: "good",
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
  scoutFindIron: {
    // The Iron Age's version of scoutFind: same shape, era-correct loot.
    // (The bronze one pays copper, which would be an inert write in iron --
    // events are content, so the new era declares its own.)
    sev: "good",
    condition: (S) => !!S.upgrades.scouting,
    chancePerSecond: 0.0016,
    effect: (S) => {
      const haul = Math.round(15 + S.pop * 2);
      S.res.wood += haul; S.res.stone += haul;
      S.res.iron += Math.round(haul * 0.4);
    },
    flavor: {
      hit: [
        "Your scouts find an abandoned bloomery in the hills, and strip it of everything worth carrying.",
        "Riders return from the far valley with a cache nobody had claimed.",
        "Scouts map a seam of iron in the uplands and bring back the first of it.",
      ],
    },
  },
};

// ---------- Hint library ------------------------------------
// One-time Chronicle hints: fire once when `when()` first holds, then never
// again (tracked in S.seen). Which hints are live in an era is the manifest's
// `hints` slate -- slate membership replaced the S.era checks that used to
// hide inside individual `when()` conditions.
const HINT_LIB = {
  wood:  { when: () => S.res.wood  > 0, msg: "You have wood enough to notice its worth." },
  stone: { when: () => S.res.stone > 0, msg: "Stone piles up beside the wood." },
  build: { when: () => S.res.wood >= 8, msg: "There is timber enough to build. Raise a hut for your people." },
  tools: { when: () => S.builds.hut >= 1, msg: "With shelter secured, your people turn to better tools." },
  rotFood: { when: () => S.res.food >= caps().food - 0.01,
    msg: "Your food stores are full — the surplus spoils in the open. Build a Granary." },
  rotWood: { when: () => S.res.wood >= caps().wood - 0.01,
    msg: "Your woodpile is full — extra timber rots in the rain. Build a Woodshed." },
  rotStone: { when: () => S.res.stone >= caps().stone - 0.01,
    msg: "Loose stone is piling up faster than anyone can stack it — the excess is lost. Build a Stone Yard." },
  sicknessWarn: { when: () => S.pop >= 4,
    msg: "More mouths, more risk — crowded camps invite sickness. An infirmary would ease their fears." },
  conflictWarn: { when: () => S.pop >= 4,
    msg: "Word of raiders reaches the settlement. A Barracks would let your people take up arms." },
  rotOre: { when: () => S.res.copper >= caps().copper - 0.01 || S.res.tin >= caps().tin - 0.01,
    msg: "Ore is heaped up beyond what anyone can sort — the excess is lost. Build an Ore Yard." },
  firstBronze: { when: () => S.res.bronze > 0,
    msg: "The first ingots cool in the mould. Bronze is yours to work with." },
  bronzeAvailable: { when: () => S.pop >= 10 && (S.units.soldier || 0) >= 1,
    msg: "Travellers speak of a harder metal, poured rather than chipped. Your people could reach it — with enough stores behind them." },
  ironAvailable: { when: () => S.pop >= 16 && ((S.units.archer || 0) >= 1 || (S.units.horseman || 0) >= 1),
    msg: "The smiths grumble that tin grows dearer every season. There is a duller, stubborner metal in your own hills — if your people learn to work it." },
  rotIron: { when: () => S.res.iron >= caps().iron - 0.01,
    msg: "Raw iron blooms are heaped up rusting in the open — the excess is lost. Build an Iron Yard." },
  firstSteel: { when: () => S.res.steel > 0,
    msg: "The Forge runs hotter than it ever did for bronze. The first steel is yours." },
  firstGold: { when: () => S.res.gold > 0,
    msg: "Gold. No one in your town has ever dug up an ounce of it — it only ever arrives from somewhere else." },
  neighbors: { when: () => S.builds.forge >= 1 || S.res.iron >= 20,
    msg: "Travellers name your neighbors now: the Hill Clans in the high passes, the River Kingdom downstream, the Salt Nomads on the flats. A Muster Ground would let your people range out to meet them — one way or another." },
};

// ---------- The Stone Age (base manifest) -------------------
// The first era is authored in full; every later era is a delta against the
// one before it. Field notes, category by category:
//   resources: `capBuilding` is the storage building that raises the ceiling
//     (null = keeps its base cap); `reveal` gates the ledger row. Rates, caps,
//     clamping and rendering all iterate this list.
//   jobs: `rateMult` scales yield against CONFIG.baseRate.
//   buildings: `base` = cost of the first; each next costs *scale more (unless
//     `cap`ped, in which case there is no "next" -- see Barracks). `buildTime`
//     = seconds at the front of the queue. `reveal` decides when it first
//     appears (the screen "unravels").
//   upgrades: bought once, never scale, never repeat. The list age capstones
//     live in.
//   units: trainable person-types -- same queue and cost machinery as
//     buildings, but `popCost` permanently consumes a civilian and ownership
//     lives in S.units, so they render in Your People. `strength` is baseline
//     defense contribution; `counters` names the raid type they excel against;
//     `casualtyWeight` is exposure when someone must die (see
//     removeRandomUnit) -- every weight deliberately ABOVE ZERO, bending odds,
//     never granting immunity.
const STONE = {
  name: "Stone Age",
  housingPerHut: 3,
  panelTitles: { "panel-holdings": "Settlement" },
  // What one unit of population MEANS this era (see design.md, Unit
  // Re-denomination): the number on screen stays small forever; this noun is
  // what scales. Inherited unless an era re-denominates.
  popNoun: { singular: "settler", plural: "settlers" },
  arrivalLine: "A wanderer joins your settlement.",

  resources: [
    { id: "food",  name: "Food",  baseCap: 50, capBuilding: "granary"  },
    { id: "wood",  name: "Wood",  baseCap: 50, capBuilding: "woodshed" },
    { id: "stone", name: "Stone", baseCap: 50, capBuilding: "stoneYard" },
  ],

  jobs: [
    { id: "forager",    name: "Forage food",  res: "food"  },
    { id: "woodcutter", name: "Chop wood",    res: "wood"  },
    { id: "miner",      name: "Gather stone", res: "stone" },
  ],

  buildings: [
    {
      id: "hut", name: "Hut", kind: "building", desc: "Shelter for 3 more settlers.",
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
      // "Medicine Tent" here so that "Infirmary" is available as this same
      // building's Bronze-era name (an override, not a new def). Id never changes.
      id: "infirmary", name: "Medicine Tent", kind: "building", desc: "Reduces the chance sickness claims a life.",
      base: { wood: 24, stone: 8 }, scale: 1.5, buildTime: 20,
      reveal: () => S.builds.hut >= 1,
    },
    {
      id: "barracks", name: "Barracks", kind: "building", cap: 1,
      desc: "Lets your people train as Soldiers.",
      base: { wood: 40, stone: 15 }, scale: 1.5, buildTime: 30,
      reveal: () => S.builds.hut >= 1,
    },
  ],

  upgrades: [
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
    // The age capstone. An ordinary upgrade in every respect -- same queue,
    // same cancel/refund, same cost check -- so Sickness and Conflict keep
    // rolling through its long build. That's deliberately where "and some
    // luck" lives. Its completion is the ONLY place S.era is ever assigned.
    // The Bronze delta REMOVES it: a capstone exists only in the era it ends.
    {
      id: "bronzeAge", name: "Bronze Age", kind: "upgrade",
      desc: "Copper and tin, married in fire. Step out of the age of stone.",
      base: { food: 300, wood: 300, stone: 300 }, buildTime: 120,
      reveal: () => S.pop >= 10 && (S.units.soldier || 0) >= 1,
    },
  ],

  units: [
    {
      id: "soldier", name: "Soldier", kind: "unit", popCost: 1, strength: 1.0,
      casualtyWeight: 1.0,
      desc: "A settler permanently trained for defense. Holds the line, and takes the worst of it.",
      base: { wood: 12 }, buildTime: 15,
      reveal: () => S.builds.barracks >= 1,
    },
  ],

  // What kind of raid shows up (see rollRaidType). Which unit counters which
  // raid is recorded in ONE place only -- a unit def's `counters` field naming
  // a raid id. (An earlier pass also stored the reverse mapping on the raid,
  // and comparing the wrong pair of those two silently disabled every counter
  // bonus.) A warband is simply a raid no unit names, so nothing counters it.
  // All three types roll in the Stone Age too; no counters exist yet, so they
  // read as pure flavor until Bronze makes them matter.
  raidTypes: [
    { id: "warband", name: "warband",         weight: 50 },
    { id: "massed",  name: "massed charge",   weight: 30 },
    { id: "riders",  name: "band of riders",  weight: 20 },
  ],

  events: ["greatHunt", "trader", "sickness", "conflict"],
  hints:  ["wood", "stone", "build", "tools", "rotFood", "rotWood", "rotStone",
           "sicknessWarn", "conflictWarn", "bronzeAvailable"],
};

// ---------- The Bronze Age (delta) --------------------------
// Everything the Bronze Age changes about the world, and nothing else.
// Reading this delta IS reading the era's design: huts become stone houses
// and hold more, the healers get a real building, ores and the Forge arrive,
// two unit types join, the capstone that got us here is retired.
const BRONZE_DELTA = {
  name: "Bronze Age",
  housingPerHut: 5,
  panelTitles: { "panel-holdings": "Village" },
  // The first re-denomination is a pure 1:1 relabel: your settlers started
  // families. Counts, thresholds and balance are untouched -- only the words.
  popNoun: { singular: "family", plural: "families" },
  arrivalLine: "A family seeks shelter here, and stays.",

  remove: ["bronzeAge"],

  override: {
    hut:        { name: "Stone House", desc: "Shelter for 5 more settlers." },
    infirmary:  { name: "Infirmary" },
    herbalMedicine: { desc: "Increases how much each Infirmary reduces the chance sickness claims a life." },
  },

  add: {
    resources: [
      // Present-in-era resources reveal immediately (`() => true`): the
      // manifest is the gate now, where an S.era check used to be.
      { id: "copper", name: "Copper", baseCap: 50,  capBuilding: "oreYard", reveal: () => true },
      { id: "tin",    name: "Tin",    baseCap: 50,  capBuilding: "oreYard", reveal: () => true },
      // Bronze is spent on upgrades rather than stockpiled, so it gets a
      // generous ceiling and no storage building of its own.
      { id: "bronze", name: "Bronze", baseCap: 200, capBuilding: null,      reveal: () => true },
    ],
    jobs: [
      // Tin deliberately yields half of copper -- it's the scarce half of the
      // alloy, which is both a real balance lever and why bronze was worth
      // building trade routes over.
      { id: "copperMiner", name: "Mine copper", res: "copper" },
      { id: "tinMiner",    name: "Mine tin",    res: "tin", rateMult: 0.5 },
    ],
    buildings: [
      {
        id: "archeryRange", name: "Archery Range", kind: "building", cap: 1,
        desc: "Lets your people train as Archers.",
        base: { wood: 50, stone: 20 }, scale: 1.5, buildTime: 28,
        reveal: () => S.builds.barracks >= 1,
      },
      {
        id: "stables", name: "Stables", kind: "building", cap: 1,
        desc: "Lets your people train as Horsemen, and makes scouting possible.",
        base: { wood: 60, stone: 25, bronze: 10 }, scale: 1.5, buildTime: 34,
        reveal: () => S.builds.barracks >= 1,
      },
      {
        id: "oreYard", name: "Ore Yard", kind: "building",
        desc: "Store +100 copper and +100 tin (ores pile up unusable otherwise).",
        base: { wood: 30, stone: 20 }, scale: 1.55, buildTime: 18,
        reveal: () => true,
      },
      {
        // The first building that TRANSFORMS rather than produces or boosts.
        // No workers: the opportunity cost is already paid by the miners
        // feeding it, and "would you like to stop smelting?" isn't an
        // interesting choice when neither input has another use.
        id: "forge", name: "Forge", kind: "building",
        desc: "Smelts 4 copper + 1 tin into 1 bronze, continuously.",
        base: { wood: 45, stone: 30 }, scale: 1.5, buildTime: 26,
        converts: { in: { copper: 4, tin: 1 }, out: { bronze: 1 }, rate: 0.05 },
        reveal: () => true,
      },
    ],
    upgrades: [
      {
        id: "bronzeTools", name: "Bronze Tools", kind: "upgrade",
        desc: "Permanently improves all gathering by 15%.",
        base: { wood: 40, bronze: 25 }, buildTime: 30,
        reveal: () => true,
      },
      {
        id: "bronzeWeapons", name: "Bronze Weapons", kind: "upgrade",
        desc: "Cast blades outclass flint. A further improvement to your Soldiers' odds in a fight.",
        base: { wood: 30, bronze: 40 }, buildTime: 30,
        reveal: () => S.builds.barracks >= 1,
      },
      {
        id: "scouting", name: "Scouting", kind: "upgrade",
        desc: "Riders range beyond the valley and bring back word of what's out there.",
        base: { food: 40, bronze: 15 }, buildTime: 25,
        reveal: () => S.builds.stables >= 1,
      },
      // The age capstone (see the stone manifest's bronzeAge for the pattern
      // notes). The pop gate scales up from Bronze's 10; the unit gate wants
      // an Archer OR Horseman fielded, so the composition system -- this
      // age's whole lesson -- was actually explored. The 50 bronze makes the
      // Forge load-bearing one last time before it changes jobs (canonical
      // rule: a capstone is priced in the signature currency of its age).
      {
        id: "ironAge", name: "Iron Age", kind: "upgrade",
        desc: "The far mines grow distant and dear. Turn to the stubborn metal in your own hills.",
        base: { food: 400, wood: 400, stone: 400, bronze: 50 }, buildTime: 180,
        reveal: () => S.pop >= 16 && ((S.units.archer || 0) >= 1 || (S.units.horseman || 0) >= 1),
      },
    ],
    units: [
      {
        id: "archer", name: "Archer", kind: "unit", popCost: 1,
        strength: 1.0, counters: "massed", casualtyWeight: 0.35,
        desc: "Deadly against a massed charge, and safer than most — they fight from behind the line.",
        base: { wood: 14, bronze: 6 }, buildTime: 18,
        reveal: () => S.builds.archeryRange >= 1,
      },
      {
        id: "horseman", name: "Horseman", kind: "unit", popCost: 1,
        strength: 1.5, counters: "riders", casualtyWeight: 0.6,
        desc: "Strong in any fight, quick enough to run down mounted raiders, and quick enough to withdraw.",
        base: { wood: 20, bronze: 14 }, buildTime: 24,
        reveal: () => S.builds.stables >= 1,
      },
    ],
  },

  // Slates are wholesale, never inherited -- see the manifest-model note.
  events: ["greatHunt", "trader", "sickness", "conflict", "scoutFind", "scoutWarning"],
  hints:  ["wood", "stone", "build", "tools", "rotFood", "rotWood", "rotStone",
           "sicknessWarn", "conflictWarn", "rotOre", "firstBronze", "ironAvailable"],
};

// ---------- The Iron Age (delta) ----------------------------
// The first delta with a real `remove` list -- an entire economy retires.
// The story is the Late Bronze Age collapse: the copper-and-tin trade dies,
// and iron wins by being LOCAL. Bronze-priced upgrades leave the shop (the
// validator forces this -- their costs name a dead resource); anything
// already OWNED keeps working, because a bought upgrade is a trait read from
// state, not the shop shelf. Gold is the era's genuinely new idea: no job
// produces it, ever -- it arrives only from outside (the heirloom sell-off
// below, and in time plunder and trade), so the era's wealth is structurally
// tied to its outward verbs. See design.md, Iron Age.
const IRON_DELTA = {
  name: "Iron Age",
  housingPerHut: 7,
  // "Underway": once the world opens, the queue panel tracks more than
  // builds -- marching columns and caravans render there too (see renderQueue).
  panelTitles: { "panel-holdings": "Town", "panel-queue": "Underway" },
  popNoun: { singular: "holdfast", plural: "holdfasts" },
  arrivalLine: "A holdfast swears fealty to your banner.",
  // The first real consolidation (see design.md): generous, floored, and THE
  // flex dial for playtest pacing. keep 0.7 reads as "for every 5, you get 3
  // or 4." Never inherited -- each border decides its own ratio.
  consolidate: {
    keep: 0.7,
    narrate: "Families band together behind shared walls — your people now count themselves in holdfasts.",
  },

  remove: [
    "copper", "tin", "bronze",            // the alloy economy, wholesale
    "copperMiner", "tinMiner",            // its jobs (workers walk home -- default policy)
    "oreYard",                            // its storage
    "bronzeTools", "bronzeWeapons", "scouting",  // stranded: priced in a dead resource
    "flintSpears",                        // superseded twice over
    "ironAge",                            // a capstone exists only in the era it ends
  ],

  override: {
    hut: { name: "Longhouse", desc: "Shelter for 7 more settlers." },
    forge: {
      desc: "Burns wood to work iron into steel — 3 iron + 2 wood into 1 steel, continuously.",
      converts: { in: { iron: 3, wood: 2 }, out: { steel: 1 }, rate: 0.05 },
    },
    // Re-priced out of the dead resource. Iron is cheaper than bronze was --
    // it's everywhere; that's the whole point of the era.
    stables: { base: { wood: 60, stone: 25, iron: 12 } },
    archer: { base: { wood: 14, iron: 8 } },
    horseman: { base: { wood: 20, iron: 16 } },
  },

  add: {
    resources: [
      { id: "iron",  name: "Iron",  baseCap: 50,  capBuilding: "ironYard", reveal: () => true },
      // Steel, like bronze before it, is spent rather than stockpiled.
      { id: "steel", name: "Steel", baseCap: 200, capBuilding: null,       reveal: () => true },
      // Gold cannot be mined. It enters only from outside.
      { id: "gold",  name: "Gold",  baseCap: 50,  capBuilding: "treasury", reveal: () => true },
    ],
    jobs: [
      // Full rate, no tin-style scarcity -- scarcity was bronze's story.
      { id: "ironMiner", name: "Mine iron", res: "iron" },
    ],
    buildings: [
      {
        id: "ironYard", name: "Iron Yard", kind: "building",
        desc: "Store +100 iron (raw blooms rust and scatter otherwise).",
        base: { wood: 35, stone: 25 }, scale: 1.55, buildTime: 18,
        reveal: () => true,
      },
      {
        id: "treasury", name: "Treasury", kind: "building",
        desc: "Store +100 gold, under guard and under stone.",
        base: { wood: 40, stone: 40, iron: 10 }, scale: 1.6, buildTime: 22,
        reveal: () => true,
      },
      {
        // Gates the Expeditions panel the way the Barracks gated Training.
        // One Muster Ground, one outbound column at a time -- the cap IS the
        // pacing of the era's outward verbs.
        id: "musterGround", name: "Muster Ground", kind: "building", cap: 1,
        desc: "Where expeditions gather — fighters, wagons, provisions. Opens the world beyond the valley.",
        base: { wood: 60, stone: 30, iron: 20 }, scale: 1.5, buildTime: 35,
        reveal: () => true,
      },
      {
        id: "siegeWorkshop", name: "Siege Workshop", kind: "building", cap: 1,
        desc: "Lets your people build and crew Siege Engines.",
        base: { wood: 50, stone: 40, iron: 15 }, scale: 1.5, buildTime: 30,
        reveal: () => S.builds.barracks >= 1,
      },
    ],
    upgrades: [
      {
        id: "ironTools", name: "Iron Tools", kind: "upgrade",
        desc: "Permanently improves all gathering by 22%.",
        base: { iron: 40, gold: 15 }, buildTime: 30,
        reveal: () => true,
      },
      {
        id: "ironWeapons", name: "Iron Weapons", kind: "upgrade",
        desc: "Steel edges hold where bronze bends. A further improvement to your fighters' odds in any fight.",
        base: { steel: 40, gold: 20 }, buildTime: 35,
        reveal: () => S.builds.barracks >= 1,
      },
      {
        id: "steelArmor", name: "Steel Armor", kind: "upgrade",
        desc: "Plate over hide. Improves your fighters' odds of surviving a fight, again.",
        base: { steel: 30, gold: 25 }, buildTime: 30,
        reveal: () => S.builds.barracks >= 1,
      },
    ],
    units: [
      {
        // `siege: true` is the wall-power flag (see wallPower). In the field
        // and at home it's an ordinary unit -- the machine is only special
        // against stone.
        id: "siegeEngine", name: "Siege Engine", kind: "unit", popCost: 1,
        strength: 1.0, siege: true, casualtyWeight: 0.5,
        desc: "Engineers and their machine. Tears down walls like nothing else; fights and defends like anyone else.",
        base: { wood: 45, stone: 30, iron: 12 }, buildTime: 30,
        reveal: () => S.builds.siegeWorkshop >= 1,
      },
    ],
  },

  // The collapse, narrated. Bronze -- suddenly antique -- sells to
  // collectors and temple-makers, seeding the first gold and teaching the
  // new resource in one line.
  migrations: [
    { bucket: "res", id: "copper", vanish: true,
      narrate: "The copper road falls silent. What is left in the yard is scrap." },
    { bucket: "res", id: "tin", vanish: true,
      narrate: "No tin has come up the river in a season. None will again." },
    { bucket: "res", id: "bronze", convertTo: "gold", ratio: 0.25,
      narrate: "Bronze is suddenly antique — collectors and temple-makers pay gold for your stock of it." },
  ],

  // The era's counterparties. Adversaries are declared WHOLESALE per era,
  // like the slates -- never inherited; each age's world arrives fresh, with
  // fresh stocks, by construction. The manifest entry is the template; the
  // living remnant (depleting stock, standing) lives in S.adversaries.
  // `fightsAs` names a raid type, so unit counters point outward for free.
  // `walls` is the second static number beside strength: fortification that
  // must fall before any defender does (see resolveCampaign). Damage to it
  // PERSISTS in the living remnant. The fort tier is told through the desc --
  // laager / palisade / castle -- per the flavor-is-load-bearing law, and
  // deliberately cross-cuts disposition so the slate doesn't template.
  adversaries: [
    {
      id: "hillClans", name: "the Hill Clans", disposition: "warlike",
      strength: 9, walls: 5, fightsAs: "massed", campaignTime: 90,
      stock: { food: 120, wood: 90, iron: 60, gold: 15 },
      desc: "Raiders in the high passes — weak alone, bold when your walls look thin. Their seat crouches behind a rough timber palisade.",
    },
    {
      id: "riverKingdom", name: "the River Kingdom", disposition: "peaceful",
      strength: 32, walls: 26, fightsAs: "riders", campaignTime: 120, caravanTime: 75,
      stock: { food: 250, steel: 25, gold: 240 },
      buys: { res: "food", amount: 60, pays: 15 },
      desc: "A state downriver, rich beyond counting and always hungry — they pay gold for food. Its heart is a stone-walled castle on the bluffs.",
    },
    {
      id: "saltNomads", name: "the Salt Nomads", disposition: "peaceful",
      strength: 13, walls: 2, fightsAs: "riders", campaignTime: 75, caravanTime: 60,
      stock: { food: 90, iron: 30, gold: 80 },
      buys: { res: "iron", amount: 40, pays: 12 },
      desc: "Wandering herders with no mines of their own — they pay gold for iron. At night they circle their wagons into a laager; they build no walls.",
    },
  ],

  events: ["greatHunt", "trader", "sickness", "conflict", "scoutFindIron", "scoutWarning"],
  hints:  ["wood", "stone", "build", "tools", "rotFood", "rotWood", "rotStone",
           "sicknessWarn", "conflictWarn", "rotIron", "firstSteel", "firstGold", "neighbors"],
};

// ---------- Manifest compiler -------------------------------
// Compiles the authoring above into MANIFESTS at load. Every def is
// shallow-copied, so an override can never reach back and mutate the parent
// era's copy. Unknown ids in remove/override, duplicate ids in add, unknown
// slate entries, and a missing events/hints slate all THROW -- at load,
// before a single frame renders. Silent wrongness from a dangling id is this
// game's signature bug class; the compiler's job is to convert it into a
// loud one. (Phase B adds a full cross-reference validator on top.)
const DEF_CATEGORIES = ["resources", "jobs", "buildings", "upgrades", "units"];

function resolveSlates(m, raw) {
  if (!raw.events) throw new Error(`era "${m.name}": missing events slate (slates are never inherited)`);
  if (!raw.hints)  throw new Error(`era "${m.name}": missing hints slate (slates are never inherited)`);
  m.events = raw.events.map((id) => {
    if (!EVENT_LIB[id]) throw new Error(`era "${m.name}": unknown event "${id}" in slate`);
    return Object.assign({ id }, EVENT_LIB[id]);
  });
  m.hints = raw.hints.map((id) => {
    if (!HINT_LIB[id]) throw new Error(`era "${m.name}": unknown hint "${id}" in slate`);
    return Object.assign({ id }, HINT_LIB[id]);
  });
}

function compileBase(raw) {
  const m = {
    name: raw.name,
    housingPerHut: raw.housingPerHut,
    panelTitles: Object.assign({}, raw.panelTitles),
    popNoun: Object.assign({}, raw.popNoun),
    arrivalLine: raw.arrivalLine,
    raidTypes: raw.raidTypes.slice(),
    migrations: [],   // a base era is never entered FROM anywhere
    consolidate: null,
    // Wholesale like the slates, never inherited: each age's world arrives
    // fresh, with fresh stocks, by construction.
    adversaries: (raw.adversaries || []).map((a) => Object.assign({}, a)),
  };
  for (const cat of DEF_CATEGORIES) m[cat] = raw[cat].map((d) => Object.assign({}, d));
  resolveSlates(m, raw);
  return m;
}

function extendEra(parent, delta) {
  const m = {
    name: delta.name || parent.name,
    housingPerHut: delta.housingPerHut != null ? delta.housingPerHut : parent.housingPerHut,
    panelTitles: Object.assign({}, parent.panelTitles, delta.panelTitles),
    // The population noun inherits (Silicon keeps Bloc); an era that
    // re-denominates simply declares a new one.
    popNoun: delta.popNoun ? Object.assign({}, delta.popNoun) : parent.popNoun,
    arrivalLine: delta.arrivalLine || parent.arrivalLine,
    raidTypes: delta.raidTypes ? delta.raidTypes.slice() : parent.raidTypes,
    // Explicit state-migration instructions, run once when this era is
    // ENTERED (see runEraMigrations). Never inherited: a migration describes
    // one specific transition, not a standing rule.
    migrations: (delta.migrations || []).slice(),
    // Consolidation is per-border, never inherited (see applyConsolidation).
    consolidate: delta.consolidate ? Object.assign({}, delta.consolidate) : null,
    adversaries: (delta.adversaries || []).map((a) => Object.assign({}, a)),
  };
  const removes = new Set(delta.remove || []);
  const overrides = delta.override || {};
  const touched = new Set();   // remove/override targets actually found in the parent

  for (const cat of DEF_CATEGORIES) {
    const list = [];
    for (const d of parent[cat]) {
      if (removes.has(d.id)) { touched.add(d.id); continue; }
      const copy = Object.assign({}, d);
      if (overrides[d.id]) { Object.assign(copy, overrides[d.id]); touched.add(d.id); }
      list.push(copy);
    }
    for (const d of (delta.add && delta.add[cat]) || []) {
      if (list.some((x) => x.id === d.id)) throw new Error(`era "${m.name}": add duplicates id "${d.id}"`);
      list.push(Object.assign({}, d));
    }
    m[cat] = list;
  }

  for (const id of removes) if (!touched.has(id)) throw new Error(`era "${m.name}": removes unknown id "${id}"`);
  for (const id in overrides) if (!touched.has(id)) throw new Error(`era "${m.name}": overrides unknown id "${id}"`);
  resolveSlates(m, delta);
  return m;
}

const MANIFESTS = { stone: compileBase(STONE) };
MANIFESTS.bronze = extendEra(MANIFESTS.stone, BRONZE_DELTA);
MANIFESTS.iron = extendEra(MANIFESTS.bronze, IRON_DELTA);

// Latest-era def for every buildable id that has EVER existed, so things that
// can outlive an era hop -- queue entries, log lines about them -- still
// resolve after their def leaves the active manifest. Later eras overwrite
// earlier ones, so an id reads with its most recent identity.
const DEF_INDEX = {};
for (const era of ERA_ORDER) {
  for (const cat of ["buildings", "upgrades", "units"]) {
    for (const d of MANIFESTS[era][cat]) DEF_INDEX[d.id] = d;
  }
}

// THE indirection: every engine and render read of content goes through here.
// The stone fallback is defensive only (a hand-edited save with a bogus era).
function active() { return MANIFESTS[S.era] || MANIFESTS.stone; }

// Which building boosts which resource's yield (see mults()). Global and
// keyed by id -- era-neutral identity data, like icons. If a later era ever
// remaps a boost, this graduates into the manifests.
const BOOST_BUILDING = { food: "dryingRack", wood: "lumberCamp", stone: "stonePit" };

// ---------- Manifest validator ------------------------------
// The cross-reference pass, run at load against every compiled manifest: any
// id one piece of content uses to point at another must resolve WITHIN that
// same era. This is what makes removal safe to author -- retire a resource
// and every cost, recipe, storage building and job that still mentions it
// turns into a load-time error instead of NaN production, a converter that
// silently never runs, or a cap that quietly stops applying.
//
// Honest limit: reveal() predicates are arbitrary code and can't be
// statically validated. A stale reference there yields a hint or card that
// never appears -- annoying, but it cannot break the economy.
function validateManifests(manifests) {
  const problems = [];
  for (const era in manifests) {
    const m = manifests[era];
    const resIds = new Set(m.resources.map((r) => r.id));
    const buildIds = new Set(m.buildings.map((b) => b.id));
    const raidIds = new Set(m.raidTypes.map((r) => r.id));
    const bad = (msg) => problems.push(`[${era}] ${msg}`);

    for (const cat of ["buildings", "upgrades", "units"]) {
      for (const d of m[cat]) {
        if (!d.id || !d.name || !d.kind) bad(`${cat} entry ${d.id || "?"} missing id/name/kind`);
        if (typeof d.reveal !== "function") bad(`${d.id} has no reveal()`);
        for (const k in d.base || {}) {
          if (!resIds.has(k)) bad(`${d.id} costs "${k}", not a resource this era`);
        }
        if (d.converts) {
          for (const k in d.converts.in)  if (!resIds.has(k)) bad(`${d.id} converts from "${k}", not a resource this era`);
          for (const k in d.converts.out) if (!resIds.has(k)) bad(`${d.id} converts to "${k}", not a resource this era`);
        }
      }
    }
    for (const r of m.resources) {
      if (r.capBuilding != null && !buildIds.has(r.capBuilding)) {
        bad(`resource ${r.id} capBuilding "${r.capBuilding}" is not a building this era`);
      }
      const boost = BOOST_BUILDING[r.id];
      if (boost && !buildIds.has(boost)) bad(`resource ${r.id} boost building "${boost}" is not a building this era`);
    }
    for (const j of m.jobs) {
      if (!resIds.has(j.res)) bad(`job ${j.id} gathers "${j.res}", not a resource this era`);
    }
    for (const u of m.units) {
      if (u.counters && !raidIds.has(u.counters)) bad(`unit ${u.id} counters "${u.counters}", not a raid type this era`);
    }
    for (const ev of m.events) {
      if (ev.counter && !buildIds.has(ev.counter.building)) {
        bad(`event ${ev.id} countered by "${ev.counter.building}", not a building this era`);
      }
    }
    for (const ins of m.migrations) {
      if (!ins.bucket || !(ins.bucket in { res: 1, jobs: 1, builds: 1, units: 1, upgrades: 1 })) {
        bad(`migration targets unknown bucket "${ins.bucket}"`);
      }
      if (!ins.vanish && !ins.convertTo && !ins.fn) bad(`migration for ${ins.id} has no primitive (vanish/convertTo/fn)`);
    }
    if (!m.popNoun || typeof m.popNoun.singular !== "string" || typeof m.popNoun.plural !== "string") {
      bad(`missing or malformed popNoun`);
    }
    if (!m.arrivalLine) bad(`missing arrivalLine`);
    if (m.consolidate && !(m.consolidate.keep > 0 && m.consolidate.keep <= 1)) {
      bad(`consolidate.keep must be in (0, 1]`);
    }
    for (const a of m.adversaries) {
      if (!a.id || !a.name || !a.disposition || !(a.strength > 0)) bad(`adversary ${a.id || "?"} missing id/name/disposition/strength`);
      if (a.walls != null && !(a.walls >= 0)) bad(`adversary ${a.id} has malformed walls`);
      if (a.fightsAs && !raidIds.has(a.fightsAs)) bad(`adversary ${a.id} fights as "${a.fightsAs}", not a raid type this era`);
      if (!(a.campaignTime > 0)) bad(`adversary ${a.id} has no campaignTime`);
      for (const k in a.stock || {}) if (!resIds.has(k)) bad(`adversary ${a.id} stocks "${k}", not a resource this era`);
      if (a.buys) {
        if (a.disposition !== "peaceful") bad(`adversary ${a.id} trades but is not peaceful`);
        if (!resIds.has(a.buys.res)) bad(`adversary ${a.id} buys "${a.buys.res}", not a resource this era`);
        if (!(a.buys.amount > 0) || !(a.buys.pays > 0)) bad(`adversary ${a.id} has a malformed exchange`);
        if (!(a.caravanTime > 0)) bad(`adversary ${a.id} trades but has no caravanTime`);
      }
    }
  }
  if (problems.length) throw new Error("Manifest validation failed:\n  " + problems.join("\n  "));
}
validateManifests(MANIFESTS);

// What one era-step changes among the buildable categories, computed from the
// compiled manifests so it can never go stale. Feeds the era modal AND the
// DOM purge -- one diff, two consumers.
function manifestDiff(fromM, toM) {
  const diff = { added: [], removed: [], renamed: [] };
  for (const cat of ["buildings", "units", "upgrades"]) {
    for (const d of toM[cat]) {
      const prev = fromM && fromM[cat].find((p) => p.id === d.id);
      if (!prev) diff.added.push(d);
      else if (prev.name !== d.name) diff.renamed.push({ from: prev, to: d });
    }
    if (fromM) {
      for (const d of fromM[cat]) {
        if (!toM[cat].some((p) => p.id === d.id)) diff.removed.push(d);
      }
    }
  }
  return diff;
}

// Minimal line-art doodles -- no map, just icons.
// 1.6px stroke on a 24px grid, per the redesign: tiles render these at 21px
// now (down from 24), and 1.4 went thin and grey at that size. Legibility at a
// glance was the whole brief for the icon set.
const ICON_ATTRS = 'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"';
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
  ironYard:   `<svg ${ICON_ATTRS}><path d="M4 20 H20 M6 20 V14 H18 V20 M8 14 V10 H16 V14"/><circle cx="12" cy="17" r="1" fill="currentColor" stroke="none"/></svg>`,
  treasury:   `<svg ${ICON_ATTRS}><rect x="4" y="8" width="16" height="12" rx="1"/><path d="M4 12 H20 M12 12 V15"/><path d="M8 8 V6 A4 3 0 0 1 16 6 V8"/></svg>`,
  musterGround: `<svg ${ICON_ATTRS}><path d="M6 21 V4 M6 4 H17 L14 7.5 L17 11 H6"/><path d="M4 21 H10"/></svg>`,
  siegeWorkshop: `<svg ${ICON_ATTRS}><path d="M4 20 H20 M6 20 L12 8 L18 20"/><path d="M12 8 L12 4 L16 6"/><circle cx="9" cy="20" r="1.5"/><circle cx="15" cy="20" r="1.5"/></svg>`,
};
// Tiny queue-card type markers: hammer = build, sword = campaign,
// coins = caravan. Subtle by design -- the card text carries the verb, the
// icon just lets the eye sort the Underway panel without reading.
// A pale tint per category groups the Settlement panel at a glance without
// spending any of the semantic colour channel on it. Keyed by id like the icon
// table above, and safe for the same reason: ids are permanent and global, so
// a building keeps its tint through every rename the eras put it through.
// An id with no entry here simply renders on plain white.
const BUILDING_CATS = {
  hut: "shelter",
  woodshed: "store", granary: "store", stoneYard: "store", oreYard: "store",
  ironYard: "store", treasury: "store",
  dryingRack: "work", lumberCamp: "work", stonePit: "work", forge: "work",
  infirmary: "care",
  barracks: "people", archeryRange: "people", stables: "people",
  musterGround: "people", siegeWorkshop: "people",
};

const QUEUE_ICONS = {
  build:    `<svg ${ICON_ATTRS}><path d="M5 21 L12 14"/><path d="M9 7 L13 3 L21 11 L17 15 Z"/></svg>`,
  campaign: `<svg ${ICON_ATTRS}><path d="M5 19 L16 8"/><path d="M13 5 L19 11"/><path d="M3.5 20.5 L6.5 17.5"/></svg>`,
  caravan:  `<svg ${ICON_ATTRS}><circle cx="9" cy="15" r="5.5"/><circle cx="15" cy="9" r="5.5"/></svg>`,
};

const PERSON_ICONS = {
  settler: `<svg ${ICON_ATTRS}><circle cx="12" cy="7" r="3"/><path d="M6 20 C6 13 8.5 11 12 11 C15.5 11 18 13 18 20"/></svg>`,
  soldier: `<svg ${ICON_ATTRS}><circle cx="10" cy="7" r="3"/><path d="M4.5 20 C4.5 13 7 11 10 11 C13 11 15 13 15 20"/><path d="M8 3 L20 21"/></svg>`,
  archer:  `<svg ${ICON_ATTRS}><circle cx="9" cy="6" r="2.6"/><path d="M4 20 C4 14 6 12 9 12 C12 12 14 14 14 20"/><path d="M17 3 A11 11 0 0 1 17 19"/><path d="M17 3 L17 19 M17 11 H10"/></svg>`,
  horseman:`<svg ${ICON_ATTRS}><circle cx="9" cy="4.5" r="2.2"/><path d="M6 11 C6 8 7.5 7 9 7 C10.5 7 12 8 12 11"/><path d="M3 20 V16 C3 14 5 13 8 13 H14 L18 10 V13 C18 13 20 14 20 16 V20"/><path d="M7 20 V17 M16 20 V17"/></svg>`,
  siegeEngine:`<svg ${ICON_ATTRS}><path d="M4 20 H20 M7 20 V14 H17 V20"/><path d="M9 14 L15 4 M15 4 L18 7 M15 4 L11 5"/><circle cx="9" cy="20" r="1.5"/><circle cx="15" cy="20" r="1.5"/></svg>`,
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
// Same reasoning as `paused`, and the same deliberate exclusion from the save:
// speed is a lens on the simulation, not a property of the settlement. It also
// shouldn't survive a reload -- coming back to a game silently running at 12x
// would be a nasty surprise. Pause is really just speed 0, but it stays its own
// control because it's the one you reach for without looking.
let speed = 1;
// Which Upgrades tab is showing. UI state, same as the two above.
let upgradeTab = "available";

function freshState() {
  // State buckets span every era's ids, not just the starting era's -- the
  // active manifest decides which of them the engine actually reads. The
  // schema is deliberately unchanged by the manifest refactor: old saves load
  // as-is.
  return {
    res:   { food: CONFIG.startFood, wood: 0, stone: 0, copper: 0, tin: 0, bronze: 0,
             iron: 0, steel: 0, gold: 0 },
    jobs:  { forager: 0, woodcutter: 0, miner: 0, copperMiner: 0, tinMiner: 0, ironMiner: 0 },
    builds:{ hut: 0, woodshed: 0, granary: 0, stoneYard: 0, dryingRack: 0, lumberCamp: 0, stonePit: 0,
             infirmary: 0, barracks: 0, oreYard: 0, forge: 0, archeryRange: 0, stables: 0,
             ironYard: 0, treasury: 0, musterGround: 0, siegeWorkshop: 0 },
    // Trained person-types owned; separate from builds -- renders in Your People.
    units: { soldier: 0, archer: 0, horseman: 0, siegeEngine: 0 },
    upgrades: {},     // { [upgradeId]: true } -- presence means owned, one-time
    buildQueue: [],   // FIFO: [{ id, kind, uid, total, remaining, cost }, ...] -- only [0] progresses
    buildSeq: 0,
    pop: CONFIG.startPop,
    growth: 0,        // seconds accrued toward the next free settler; freezes while housing is full
    bought: 0,        // lifetime settlers grown -- a stat for the game-over screen
    era: "stone",     // the key into MANIFESTS -- the whole era system is this one string
    eraHistory: {},   // frozen pre-transition snapshots, keyed by the era just left -- see advanceEra()
    // The living remnants of the era's adversaries: { [id]: { stock, standing } }.
    // The manifest entry is the template; this is what actually depletes.
    adversaries: {},
    expeditions: [],  // at most one: { uid, type, adversary, units?, cargo?, total, remaining }
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
function housingPerHut() { return active().housingPerHut; }
function housing() { return CONFIG.baseHousing + S.builds.hut * housingPerHut(); }
function totalUnits() { return Object.values(S.units).reduce((a, b) => a + b, 0); }
function civilians() { return S.pop - totalUnits(); }
function jobsUsed() { return active().jobs.reduce((sum, j) => sum + (S.jobs[j.id] || 0), 0); }

// Order jobs are emptied in when the population shrinks (see removeSettler).
// Derived from the active manifest (reversed, foraging last) so a shrinking
// settlement keeps feeding itself, and a job added by a later era can't be
// forgotten here.
function releaseOrder() {
  return active().jobs.map((j) => j.id).filter((id) => id !== "forager").reverse().concat("forager");
}
// Anyone currently reserved by an in-progress (or still-waiting) unit order --
// consumed the instant it's queued, not when it completes.
function reserved() {
  return S.buildQueue.reduce((sum, q) => {
    const def = defById(q.id);
    return sum + (def && def.popCost ? def.popCost : 0);
  }, 0);
}
function idle() { return civilians() - jobsUsed() - reserved(); }

// Units marching with an expedition are alive (still in S.units, still eat,
// still count toward pop) but they are NOT HOME: they don't defend, and home
// casualties can't take them. Deployment is derived from S.expeditions rather
// than tracked separately, so it can never desync.
function deployedCount(unitId) {
  return S.expeditions.reduce((sum, ex) => sum + ((ex.units && ex.units[unitId]) || 0), 0);
}
function availableUnits(unitId) { return (S.units[unitId] || 0) - deployedCount(unitId); }

// Tool upgrades lift every gather rate (including the ores -- better tools cut
// ore too); boost buildings lift one resource each.
function mults() {
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

function caps() {
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
function rates() {
  const m = mults();
  const prod = {};
  for (const r of active().resources) prod[r.id] = 0;
  for (const j of active().jobs) {
    prod[j.res] += (S.jobs[j.id] || 0) * CONFIG.baseRate * (j.rateMult || 1) * (m[j.res] || 1);
  }
  const upkeep = S.pop * CONFIG.upkeep * (S.upgrades.fireMastery ? 0.85 : 1);
  return Object.assign(prod, { upkeep, foodNet: prod.food - upkeep });
}

// What each converter is actually running at RIGHT NOW, as net per-second
// flows (+output, -input). Mirrors runConverters' three clamps. The input
// clamp counts this second's incoming production alongside the stock, so a
// Forge fed at exactly its consumption rate -- the designed equilibrium --
// reads as running steadily instead of flickering with the stock's float
// remainder.
function converterFlows(prod) {
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
function ledgerRates() {
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
function accrueGrowth(dt) {
  if (S.pop >= housing()) return;
  S.growth += dt;
  while (S.growth >= CONFIG.settlerIntervalSeconds && S.pop < housing()) {
    S.growth -= CONFIG.settlerIntervalSeconds;
    S.pop += 1;
    S.bought += 1;
    // What "one more" means -- and how it's told -- is an era-fact.
    if (!SIM) log(active().arrivalLine, "good");
  }
}

function capWord(w) { return w.charAt(0).toUpperCase() + w.slice(1); }
// Good enough for every unit name this game will ever have ("Horseman" ->
// "Horsemen", everything else takes an s). Not a general pluralizer.
function pluralize(name) { return name.endsWith("man") ? name.slice(0, -3) + "men" : name + "s"; }

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
// Resolve a buildable id to its def. The active manifest wins -- that's what
// gives a log line or a queue card its era-correct name -- with DEF_INDEX as
// the fallback for ids that have left the manifest but can still be referred
// to (a capstone finishing at the very moment it retires itself).
function defById(id) {
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
function isRevealed(def) {
  const key = "rev:" + def.id;
  if (S.seen[key]) return true;
  if (def.reveal()) { S.seen[key] = true; return true; }
  return false;
}

// ---------- Events / combat helpers -------------------------
// Event content lives in EVENT_LIB up top; which events are live is the
// active manifest's `events` slate (see resolveEvents). What follows here is
// the machinery those events call into.

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

// What kind of raid shows up is the active manifest's `raidTypes` list (the
// counter-relationship notes live with it, in the Stone Age authoring).
function counterUnitFor(raid) { return raid ? active().units.find((u) => u.counters === raid.id) : undefined; }
function rollRaidType() {
  const types = active().raidTypes;
  const total = types.reduce((s, r) => s + r.weight, 0);
  let roll = Math.random() * total;
  for (const r of types) {
    if (roll < r.weight) return r;
    roll -= r.weight;
  }
  return types[0];
}

// Weapon tiers replace each other rather than stacking -- highest owned wins.
// These read OWNED upgrades, not the shop: a tier bought in a past era keeps
// working after its upgrade leaves the manifest.
function weaponMultiplier() {
  if (S.upgrades.ironWeapons) return 3.0;
  if (S.upgrades.bronzeWeapons) return 2.2;
  if (S.upgrades.flintSpears) return 1.6;
  return 1.0;
}
// Armor tiers replace the same way -- lowest (best) owned factor wins.
function armorFactor() {
  if (S.upgrades.steelArmor) return 0.3;
  if (S.upgrades.hideArmor) return 0.5;
  return 1.0;
}

// A single unit type's contribution to defense against a given raid.
// The counter multiplier is either CONFIG.counterBonus or exactly 1 -- never
// below. Being the "wrong" unit costs you the bonus, never your base strength,
// so any army is always better than no army (see design.md).
function unitStrength(def, raid) {
  const n = availableUnits(def.id);   // an army on campaign isn't home
  if (n <= 0) return 0;
  const matched = !!raid && def.counters === raid.id;
  return n * (def.strength || 1) * weaponMultiplier() * (matched ? CONFIG.counterBonus : 1);
}

function militaryStrength(raid) {
  return active().units.reduce((sum, def) => sum + unitStrength(def, raid), 0);
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
  for (const r of active().resources) {
    S.res[r.id] -= Math.floor((S.res[r.id] || 0) * fraction);
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

  // 1. Pull people out of jobs, in releaseOrder() (reversed manifest order,
  //    foraging last) so a shrinking settlement keeps feeding itself for as
  //    long as possible.
  for (const jid of releaseOrder()) {
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
    if (!SIM) log(`${def.name} training is abandoned — there is no one left to train.`, "bad");
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
  const units = active().units;
  // Home casualties draw only from units actually AT home -- a deployed unit
  // can die on campaign (see resolveCampaign), never to a raid it wasn't in.
  const weightOf = (def) => Math.max(0, availableUnits(def.id)) * (def.casualtyWeight || 1);
  const total = units.reduce((sum, def) => sum + weightOf(def), 0);
  if (total <= 0) return null;

  let roll = Math.random() * total;
  for (const def of units) {
    const w = weightOf(def);
    if (roll < w) {
      S.units[def.id] -= 1;
      S.pop -= 1;
      return def.name;
    }
    roll -= w;
  }
  // Floating-point guard: if rounding walked `roll` past the end, take from
  // whichever type still has someone AT HOME rather than returning null.
  for (let i = units.length - 1; i >= 0; i--) {
    if (availableUnits(units[i].id) > 0) {
      S.units[units[i].id] -= 1;
      S.pop -= 1;
      return units[i].name;
    }
  }
  return null;
}

function resolveEvents(dt) {
  // The active manifest's slate IS the eligibility list -- an event absent
  // from it doesn't exist right now. No per-event era tags to keep in sync.
  for (const ev of active().events) {
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
  for (const def of active().buildings) {
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

// ---------- Adversaries & Expeditions -----------------------
// The era's outward verbs. The Muster Ground stages ONE CAMPAIGN and ONE
// CARAVAN at a time -- soldiers and merchants are different people, so the
// two tracks run in parallel, but never two of a kind: the split is still
// the decision on each track. Resolution happens in step() on the world's
// schedule, and there are NO catch windows -- outcomes self-apply and land
// in the Chronicle. Resolution lines log even under SIM, same rule as
// migration narrates: rare and story-critical, they belong in the record
// even if they happened while you were away.
function findAdversary(id) { return active().adversaries.find((a) => a.id === id); }
function expeditionOut(type) { return S.expeditions.some((e) => e.type === type); }

function standingWord(n) {
  return n <= -2 ? "Hostile" : n === -1 ? "Wary" : n >= 2 ? "Friendly" : "Neutral";
}
function bumpStanding(st, delta) {
  st.standing = Math.max(-5, Math.min(5, st.standing + delta));
}

// Every Hostile WARLIKE neighbor multiplies the home conflict trigger --
// the one way an adversary reaches into the settlement uninvited.
function hostilityMultiplier() {
  let mult = 1;
  for (const adv of active().adversaries) {
    const st = S.adversaries[adv.id];
    if (adv.disposition === "warlike" && st && st.standing <= -2) mult *= CONFIG.hostileConflictMult;
  }
  return mult;
}
// The strongest Hostile warlike neighbor -- whose war parties prowl the
// roads. Null when the roads are safe (caravans launch one-click then; the
// escort question only exists when there's someone to escort against).
function riskAdversary() {
  let worst = null;
  for (const a of active().adversaries) {
    const st = S.adversaries[a.id];
    if (a.disposition !== "warlike" || !st || st.standing > -2) continue;
    if (!worst || a.strength > worst.strength) worst = a;
  }
  return worst;
}
function hostileRouteRisk() { return !!riskAdversary(); }

// A campaign force's strength: the same math as home defense, pointed
// outward -- weapon tiers apply, and counters match against the adversary's
// fighting style instead of a rolled raid type.
function campaignStrength(unitCounts, adv) {
  let attack = 0;
  for (const uid in unitCounts) {
    const def = active().units.find((u) => u.id === uid);
    if (!def) continue;
    const matched = def.counters === adv.fightsAs;
    attack += unitCounts[uid] * (def.strength || 1) * weaponMultiplier() * (matched ? CONFIG.counterBonus : 1);
  }
  return attack;
}

// What the column brings against stone: everyone can storm a wall (badly);
// units flagged `siege: true` hit it at CONFIG.siegeWallBonus times their
// strength. No counter bonuses -- walls have no fighting style.
function wallPower(unitCounts) {
  let power = 0;
  for (const uid in unitCounts) {
    const def = active().units.find((u) => u.id === uid);
    if (!def) continue;
    power += unitCounts[uid] * (def.strength || 1) * weaponMultiplier() * (def.siege ? CONFIG.siegeWallBonus : 1);
  }
  return power;
}

// Shared allocation check for any expedition carrying units.
function validUnitCounts(unitCounts) {
  for (const uid in unitCounts) {
    if (unitCounts[uid] < 0 || unitCounts[uid] > availableUnits(uid)) return false;
  }
  return true;
}

function launchCampaign(advId, unitCounts) {
  if (S.dead || expeditionOut("campaign") || (S.builds.musterGround || 0) < 1) return;
  const adv = findAdversary(advId);
  if (!adv) return;
  const total = Object.values(unitCounts).reduce((a, b) => a + b, 0);
  if (total < 1 || !validUnitCounts(unitCounts)) return;
  if (S.res.food < CONFIG.campaignFoodCost) return;
  S.res.food -= CONFIG.campaignFoodCost;
  S.expeditions.push({ uid: ++S.buildSeq, type: "campaign", adversary: advId,
    units: Object.assign({}, unitCounts), total: adv.campaignTime, remaining: adv.campaignTime });
  log(`A column of ${total} marches against ${adv.name}. The walls are thinner until they return.`);
  renderAll();
}

// `escort` is optional: units riding with the cargo. Escorts don't lower the
// odds of an ambush -- they decide how one ENDS (see resolveCaravan).
function launchCaravan(advId, escort) {
  if (S.dead || expeditionOut("caravan") || (S.builds.musterGround || 0) < 1) return;
  const adv = findAdversary(advId);
  const st = S.adversaries[advId];
  if (!adv || !adv.buys || !st) return;
  if (st.standing <= -2) return;                       // they remember your raids
  if ((st.stock.gold || 0) <= 0) return;               // traded dry
  if ((S.res[adv.buys.res] || 0) < adv.buys.amount) return;
  if (escort && !validUnitCounts(escort)) return;
  const guards = escort ? Object.values(escort).reduce((a, b) => a + b, 0) : 0;
  S.res[adv.buys.res] -= adv.buys.amount;
  const ex = { uid: ++S.buildSeq, type: "caravan", adversary: advId,
    cargo: { res: adv.buys.res, amount: adv.buys.amount }, total: adv.caravanTime, remaining: adv.caravanTime };
  if (guards > 0) ex.units = Object.assign({}, escort);
  S.expeditions.push(ex);
  log(`A caravan sets out for ${adv.name}, laden with ${adv.buys.amount} ${adv.buys.res}${guards ? `, under guard of ${guards}` : ""}.`);
  renderAll();
}

// A campaign casualty: drawn from the DEPLOYED force (exposure-weighted, same
// weights as home casualties), removed from the column and the population.
function removeDeployedUnit(ex) {
  const weightOf = (uid) => {
    const def = active().units.find((u) => u.id === uid);
    return (ex.units[uid] || 0) * ((def && def.casualtyWeight) || 1);
  };
  const ids = Object.keys(ex.units);
  const totalW = ids.reduce((s, uid) => s + weightOf(uid), 0);
  if (totalW <= 0) return null;
  let roll = Math.random() * totalW;
  for (const uid of ids) {
    const w = weightOf(uid);
    if (roll < w) {
      ex.units[uid] -= 1;
      S.units[uid] -= 1;
      S.pop -= 1;
      const def = active().units.find((u) => u.id === uid);
      return def ? def.name : uid;
    }
    roll -= w;
  }
  return null;
}
function totalDeployed(ex) { return Object.values(ex.units || {}).reduce((a, b) => a + b, 0); }

function resolveCampaign(ex, adv, st) {
  bumpStanding(st, -1);   // plunder is not diplomacy, win or lose -- or repelled at the walls

  // THE BREACH PHASE: walls fall before any defender does. Damage persists in
  // the living remnant -- the scars your engines carve stay carved, and a
  // breached wall stays breached for the era. A failed breach is a retreat
  // with light losses: walls repel, they don't massacre.
  if ((st.walls || 0) > 0) {
    const power = wallPower(ex.units);
    const fresh = st.walls >= (adv.walls || 0);
    if (power < st.walls) {
      st.walls -= power;
      log(`The walls of ${adv.name} hold. Your column withdraws in good order — but its work is carved into the stone.`, "bad");
      if (Math.random() < CONFIG.wallRetreatLoss * armorFactor()) {
        const lost = removeDeployedUnit(ex);
        if (lost) log(`A ${lost} falls beneath the walls.`, "bad");
      }
      return;
    }
    st.walls = 0;
    log(fresh
      ? `The walls of ${adv.name} come down in a single furious assault.`
      : `The battered walls of ${adv.name} finally give way.`, "big");
  }

  const attack = campaignStrength(ex.units, adv);
  const winChance = attack / (attack + adv.strength);

  if (Math.random() < winChance) {
    const takes = [];
    for (const k in st.stock) {
      const take = Math.floor(st.stock[k] * CONFIG.plunderFraction);
      if (take > 0) { st.stock[k] -= take; S.res[k] = (S.res[k] || 0) + take; takes.push(`${take} ${k}`); }
    }
    log(`Victory over ${adv.name}. The column returns with ${takes.length ? takes.join(", ") : "little worth taking"}.`, "big");
    // Winning can still cost someone -- softened by armor, same dial as home.
    if (Math.random() < (adv.strength / (attack + adv.strength)) * armorFactor()) {
      const lost = removeDeployedUnit(ex);
      if (lost) log(`The victory had a price — a ${lost} does not come home.`, "bad");
    }
  } else {
    const losses = Math.min(totalDeployed(ex), 1 + Math.floor(adv.strength / 8));
    let fell = 0;
    for (let i = 0; i < losses; i++) if (removeDeployedUnit(ex)) fell++;
    log(`The campaign against ${adv.name} is broken. ${fell > 0 ? `${fell} of your fighters fall covering the retreat.` : "The column limps home."}`, "bad");
  }
}

function resolveCaravan(ex, adv, st) {
  // Ambush: while a warlike neighbor is Hostile, their war parties prowl the
  // roads at a flat chance. Escorts don't lower the odds of being found --
  // they decide how the ambush ENDS: fight through and the trade completes.
  const raiders = riskAdversary();
  if (raiders && Math.random() < CONFIG.caravanRaidChance) {
    const escortStr = ex.units ? campaignStrength(ex.units, raiders) : 0;
    if (escortStr <= 0) {
      log(`Your caravan to ${adv.name} never arrives — ${raiders.name} took it on the road. The cargo is lost.`, "bad");
      return;
    }
    if (Math.random() < escortStr / (escortStr + raiders.strength)) {
      log(`${raiders.name} fall on your caravan — and the escort fights them through.`, "good");
      if (Math.random() < (raiders.strength / (escortStr + raiders.strength)) * armorFactor()) {
        const lost = removeDeployedUnit(ex);
        if (lost) log(`The road took its toll — a ${lost} does not come home.`, "bad");
      }
      // ...and the trade goes ahead below.
    } else {
      const lost = removeDeployedUnit(ex);
      log(`${raiders.name} overwhelm your caravan${lost ? ` — a ${lost} falls defending it` : ""}. The cargo is lost.`, "bad");
      return;
    }
  }

  const wary = st.standing < 0;   // read BEFORE the trade improves things
  const premium = st.standing >= 2 ? 1.25 : 1;
  const pays = Math.min(Math.floor(adv.buys.pays * premium), Math.floor(st.stock.gold || 0));
  st.stock.gold = (st.stock.gold || 0) - pays;
  // Sold goods JOIN their stock -- stocks are real, and what you sell them a
  // later campaign could take back. The game never mentions this.
  st.stock[ex.cargo.res] = (st.stock[ex.cargo.res] || 0) + ex.cargo.amount;
  S.res.gold = (S.res.gold || 0) + pays;
  bumpStanding(st, 1);
  if (pays <= 0) {
    log(`The caravan returns from ${adv.name} unpaid — they have no gold left to give.`, "bad");
  } else if (wary) {
    // The rep system, hinted through narration rather than printed as a number.
    log(`The caravan returns from ${adv.name} with ${pays} gold, counted out in silence under armed watch. They have not forgotten.`);
  } else {
    log(`The caravan returns from ${adv.name} with ${pays} gold.`, "good");
  }
}

// Ticks in step(). An expedition whose adversary no longer exists (the era
// flipped mid-flight) simply comes home: units were never removed from
// S.units, so removing the expedition entry IS their return.
function resolveExpeditions(dt) {
  for (let i = S.expeditions.length - 1; i >= 0; i--) {
    const ex = S.expeditions[i];
    ex.remaining -= dt;
    if (ex.remaining > 0) continue;
    S.expeditions.splice(i, 1);
    const adv = findAdversary(ex.adversary);
    const st = S.adversaries[ex.adversary];
    if (!adv || !st) continue;
    if (ex.type === "campaign") resolveCampaign(ex, adv, st);
    else resolveCaravan(ex, adv, st);
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
  for (const res of active().resources) {
    S.res[res.id] += (res.id === "food" ? r.foodNet : r[res.id]) * dt;
  }

  runConverters(dt);

  // Storage caps: surplus spoils/rots/is lost (silent; a one-time hint fires via reveals).
  const c = caps();
  for (const res of active().resources) {
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

  // Sickness, conflict, windfalls -- whatever the active manifest's slate holds.
  resolveEvents(dt);

  // Outbound columns tick and resolve on the world's schedule.
  resolveExpeditions(dt);

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
  const badgeText = document.getElementById("ageBadgeText");
  if (badgeText) badgeText.textContent = "Fallen";
  if (badge) badge.classList.add("fallen");
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
  // Pacing telemetry (console only): stamp the game clock when age research
  // starts, so playtest timing doesn't require watching the clock.
  if (CAPSTONES[def.id]) console.log(`[pacing] ${def.name} research started at ${fmtTime(S.playtime)}`);
  if (def.kind === "upgrade") {
    log(wasEmpty ? `Work begins on ${def.name}.` : `${def.name} joins the queue (#${S.buildQueue.length}).`);
  } else if (def.kind === "unit") {
    log(wasEmpty ? `${def.name} training begins.` : `${def.name} training joins the queue (#${S.buildQueue.length}).`);
  } else {
    log(wasEmpty ? `Ground is broken for a ${def.name}.` : `A ${def.name} joins the queue (#${S.buildQueue.length}).`);
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
  if (CAPSTONES[item.id]) console.log(`[pacing] ${defById(item.id).name} research cancelled at ${fmtTime(S.playtime)}`);
  log(`Construction of the ${defById(item.id).name} is called off; materials recovered.`);
  renderAll();
}

function completeConstruction(site) {
  const def = defById(site.id);
  if (def.kind === "upgrade") S.upgrades[def.id] = true;
  else if (def.kind === "unit") S.units[def.id] = (S.units[def.id] || 0) + 1;
  else S.builds[def.id] = (S.builds[def.id] || 0) + 1;
  onComplete(def);
}

// Which upgrade ids are age capstones, and where each one leads. The only
// per-capstone wiring an age transition needs.
const CAPSTONES = { bronzeAge: "bronze", ironAge: "iron" };

function onComplete(def) {
  if (CAPSTONES[def.id]) { advanceEra(CAPSTONES[def.id]); return; }

  if (def.id === "hut") {
    const n = S.builds.hut;
    if (n === 1) log(`A ${def.name.toLowerCase()} stands. There is room to grow.`, "good");
    else log(`Another ${def.name.toLowerCase()} raised. Housing now ${housing()}.`, "good");
    if (n === 3) log("A cluster of rooftops — this is becoming a real place.", "big");
  } else if (def.kind === "unit") {
    log(`A settler trains as a ${def.name}. You now field ${S.units[def.id]}.`, "good");
  } else {
    log(`${def.name} complete. ${def.desc}`, "good");
  }
}

// The one and only place S.era is ever assigned. S.era is nothing more than
// the key into MANIFESTS -- every read of content goes through active() -- so
// flipping it swaps the entire world in one assignment. Everything else here
// is the transition machinery around that assignment, in a deliberate order:
//
//   1. Capture `before` values and the frozen SNAPSHOT while the old manifest
//      is still active. The snapshot is archived in S.eraHistory[fromEra]
//      (kept for every era, forever -- it's a few hundred bytes and it's the
//      raw material for diagnosing or recovering a bad migration, the
//      project's first genuinely destructive state change).
//   2. Flip S.era.
//   3. Run migrations. Formulas read ONLY the snapshot and write ONLY live
//      state, so instruction order cannot matter by construction.
//   4. Purge DOM nodes for ids that didn't survive -- the one place content
//      is ever allowed to leave the screen ("nothing can un-reveal" holds
//      everywhere except an era boundary).
//   5. reconcileWorkforce(), in case released workers left the books odd.
//
// The full announcement lives in a modal; a single milestone line still goes
// to the Chronicle so the settlement's own record contains the moment.
function advanceEra(era) {
  const fromEra = S.era;
  const fromM = active();
  const before = { housing: housing() };
  const shallow = Object.assign({}, S);
  delete shallow.eraHistory;               // snapshots don't nest snapshots
  S.eraHistory[fromEra] = JSON.parse(JSON.stringify(shallow));

  S.era = era;
  const toM = active();
  // Pacing telemetry (console only), the bookend to the started line in build().
  console.log(`[pacing] ${toM.name} began at ${fmtTime(S.playtime)}`);
  initAdversaries();
  runEraMigrations(fromM, toM, S.eraHistory[fromEra]);
  if (toM.consolidate) applyConsolidation(toM.consolidate);
  purgeDom(fromM, toM);
  reconcileWorkforce();

  // Silent during offline catch-up -- simulateOffline() announces it instead,
  // rather than firing a modal at someone the instant the page loads.
  if (SIM) return;
  log(`The ${toM.name} begins.`, "big");
  openEraModal(era, before);
}

// Applies an era's state migrations. Implicit default: everything carries.
// State under ids that left the manifest is INERT, never deleted (the
// settled invariant) -- with one default policy on top: workers assigned to
// a job that no longer exists return to idle, since a person standing around
// is visible state the player can see and re-spend, not a ledger entry.
// Explicit instructions come from the delta's `migrations` list:
//   { bucket, id, vanish: true, narrate }              -- state zeroed
//   { bucket, id, convertTo, ratio?, narrate }         -- moved within the bucket, floor'd
//   { bucket, id, fn: (snapshot) => value, narrate }   -- computed fresh
// Formulas read the frozen snapshot, never live state. Narrate lines log
// even under SIM: an era transition is rare enough that its story belongs in
// the Chronicle even when it happened while you were away.
function runEraMigrations(fromM, toM, snapshot) {
  for (const j of fromM.jobs) {
    if (!toM.jobs.some((x) => x.id === j.id) && (S.jobs[j.id] || 0) > 0) {
      const n = S.jobs[j.id];
      S.jobs[j.id] = 0;
      log(`${n} of your people set down tools the new age has no use for.`);
    }
  }
  for (const ins of toM.migrations) {
    const bucket = S[ins.bucket];
    const snapBucket = snapshot[ins.bucket] || {};
    if (ins.vanish) {
      if (ins.bucket === "upgrades") delete bucket[ins.id];
      else bucket[ins.id] = 0;
    } else if (ins.convertTo) {
      const gained = Math.floor((snapBucket[ins.id] || 0) * (ins.ratio != null ? ins.ratio : 1));
      bucket[ins.convertTo] = (bucket[ins.convertTo] || 0) + gained;
      bucket[ins.id] = 0;
    } else if (ins.fn) {
      bucket[ins.id] = ins.fn(snapshot);
    }
    if (ins.narrate) log(ins.narrate);
  }
}

// The re-denomination consolidation (see design.md, Unit Re-denomination):
// entering an era whose units mean more, your people gather into fewer of
// them. Civilians and each unit type floor independently against the keep
// ratio (units never below what's currently deployed -- a column abroad
// can't be consolidated out from under its own expedition), pop is rebuilt
// as their sum so the books can't desync, and job assignments floor along
// with them; advanceEra's reconcileWorkforce() sweeps up any remainder.
function applyConsolidation(spec) {
  const civBefore = civilians();
  let unitTotal = 0;
  for (const id in S.units) {
    S.units[id] = Math.max(deployedCount(id), Math.floor((S.units[id] || 0) * spec.keep));
    unitTotal += S.units[id];
  }
  S.pop = Math.max(1, Math.floor(civBefore * spec.keep)) + unitTotal;
  for (const j in S.jobs) S.jobs[j] = Math.floor((S.jobs[j] || 0) * spec.keep);
  if (spec.narrate) log(spec.narrate);
}

// Remove the DOM nodes of every id that didn't survive the era hop -- cards,
// holdings tiles, person tiles, job rows, resource rows. Renderers only ever
// CREATE nodes for ids in the active manifest, so after this purge a
// retired id is fully gone: no stale card, no frozen tile. Runs under SIM
// too -- the page's DOM exists during offline catch-up and would otherwise
// keep the stale nodes.
function purgeDom(fromM, toM) {
  const kill = (elId) => {
    const el = document.getElementById(elId);
    if (el && el.parentNode) el.parentNode.removeChild(el);
  };
  for (const cat of DEF_CATEGORIES) {
    for (const d of fromM[cat]) {
      if (toM[cat].some((x) => x.id === d.id)) continue;
      kill("bcard-" + d.id);
      kill("hold-" + d.id);
      kill("ptile-" + d.id);
      kill("job-" + d.id);
      kill("res-" + d.id);
    }
  }
}

// ---------- Progressive reveal / one-time hints -------------
// Hint content lives in HINT_LIB up top; which hints are live is the active
// manifest's `hints` slate.
function checkReveals() {
  for (const rv of active().hints) {
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
  // A mark in the gutter, and the gutter's right edge is the legal pad's red
  // margin rule. The mark repeats the severity the colour already carries,
  // which is deliberate: it survives being skimmed, and it survives colour
  // blindness. Neutral lines get a quiet mid-dot rather than nothing, so the
  // gutter reads as a ruled column instead of an intermittent one.
  const MARKS = { good: "+", bad: "!", big: "★" };
  div.innerHTML =
    `<span class="mark">${MARKS[cls] || "·"}</span>` +
    `<span class="text"></span>`;
  div.querySelector(".text").textContent = text;

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

// ---------- Tooltips ----------------------------------------
// Descriptions live here and nowhere else. Inline descriptions clogged the
// board once eight panels were open; moving them to hover means they can be
// MORE verbose, not less. The tooltip also carries the refusal reason, so
// there is exactly one place to look when something won't buy.
//
// Content is computed at hover time via a getter stashed on the element
// (`el.__tip`), not baked in at creation -- cards update in place, so a
// snapshot taken when the card was built would go stale immediately.
let tipEl = null;
function attachTip(el, getter) {
  el.__tip = getter;
  if (el.__tipWired) return;
  el.__tipWired = true;
  el.addEventListener("mouseenter", (e) => tipShow(el, e));
  el.addEventListener("mousemove", (e) => tipMove(e));
  el.addEventListener("mouseleave", tipHide);
  // A card that becomes disabled mid-hover stops firing mouseleave in some
  // browsers, so blur is a second exit.
  el.addEventListener("blur", tipHide);
}

function tipShow(el, ev) {
  const t = el.__tip && el.__tip();
  if (!t || !t.title) return;
  tipEl = tipEl || document.getElementById("tooltip");
  if (!tipEl) return;
  document.getElementById("tipTitle").textContent = t.title;
  document.getElementById("tipBody").textContent = t.body || "";
  const why = document.getElementById("tipWhy");
  why.textContent = t.why || "";
  why.classList.toggle("hidden", !t.why);
  tipEl.classList.remove("hidden");
  tipMove(ev);
}

function tipMove(ev) {
  if (!tipEl || tipEl.classList.contains("hidden")) return;
  const pad = 14, w = tipEl.offsetWidth, h = tipEl.offsetHeight;
  // Flip to the other side of the cursor rather than letting the box run off
  // the viewport -- the rightmost column is where the wordiest cards live.
  let x = ev.clientX + pad;
  let y = ev.clientY + pad;
  if (x + w > window.innerWidth - 8) x = ev.clientX - w - pad;
  if (y + h > window.innerHeight - 8) y = ev.clientY - h - pad;
  tipEl.style.left = Math.max(8, x) + "px";
  tipEl.style.top = Math.max(8, y) + "px";
}

function tipHide() {
  tipEl = tipEl || document.getElementById("tooltip");
  if (tipEl) tipEl.classList.add("hidden");
}

// "Short 24 wood, 3 stone." -- the refusal reason, in the tooltip, in red.
function shortfallLine(cost) {
  const short = Object.keys(cost)
    .filter((k) => (S.res[k] || 0) < cost[k])
    .map((k) => `${Math.ceil(cost[k] - (S.res[k] || 0))} ${k}`);
  return short.length ? `Short ${short.join(", ")}.` : null;
}

// Shared create-once-update-in-place tile, used by Settlement (buildings) and
// Your People (person-types) -- same visual language, different data source.
// Icon + count side by side, no label: the old stacked icon/name/number
// arrangement read as a fraction. The name moves to the tooltip along with the
// description -- everything except the first three settlers was built
// deliberately, so the player already has context for what they're looking at.
function renderTile(container, prefix, id, icon, name, count, cat, desc) {
  let tile = document.getElementById(prefix + id);
  if (!tile) {
    tile = document.createElement("div");
    tile.className = "holding";
    tile.id = prefix + id;
    tile.innerHTML =
      `<span class="h-icon">${icon}</span>` +
      `<span class="h-count" id="${prefix}${id}-count"></span>`;
    container.appendChild(tile);
  }
  if (cat) tile.dataset.cat = cat;
  document.getElementById(`${prefix}${id}-count`).textContent = count;
  // Name is read fresh on every hover rather than baked in at creation -- an
  // era change renames existing tiles in place (Medicine Tent -> Infirmary).
  attachTip(tile, () => ({ title: name, body: desc || "" }));
}

// Population leads the ledger. It has a value, a cap and a rate, so it IS a
// resource, and it belongs with the others rather than in a bespoke widget
// inside Your People. Two sentences died to make this row: "Housing is full"
// (the red at-cap value says it better) and the idle readout (now a red note
// riding in this same cell, because idle labour is a problem to fix).
function renderPopRow(bar) {
  let row = document.getElementById("res-pop");
  if (!row) {
    row = document.createElement("div");
    row.className = "res";
    row.id = "res-pop";
    row.innerHTML =
      `<span class="res-name">Pop</span>` +
      `<span class="res-val" id="val-pop">0</span>` +
      `<span class="res-rate" id="rate-pop"></span>` +
      `<span class="res-note" id="note-pop"></span>`;
    // Always first: it is the resource every other one is in service of.
    bar.insertBefore(row, bar.firstChild);
  }

  const cap = housing();
  const full = S.pop >= cap;
  const idleNow = idle();
  const noun = active().popNoun;

  const valEl = document.getElementById("val-pop");
  valEl.innerHTML = `${fmt(S.pop)}<span class="cap"> / ${fmt(cap)}</span>`;
  valEl.classList.toggle("full", full);

  const rateEl = document.getElementById("rate-pop");
  rateEl.textContent = full ? "" : fmtRate(1 / CONFIG.settlerIntervalSeconds);
  rateEl.classList.toggle("pos", !full);

  const noteEl = document.getElementById("note-pop");
  noteEl.textContent = idleNow > 0 ? `${idleNow} idle` : "";

  attachTip(row, () => ({
    title: capWord(noun.plural),
    body: full
      ? `Every roof is taken. Raise more housing and the next ${noun.singular} will have somewhere to sleep.`
      : `New ${noun.plural} arrive on their own while there is housing to spare. Everyone eats, whether working or not.`,
    why: idleNow === 1
      ? "One of them stands idle — put them to work."
      : idleNow > 1 ? `${idleNow} of them stand idle — put them to work.` : null,
  }));
}

// Rows are built from the manifest's resource list on first appearance rather
// than being written into index.html, so adding a resource needs no markup change.
function renderResources() {
  const bar = document.getElementById("resourceBar");
  const r = ledgerRates();   // production NET of converter flows -- see ledgerRates()
  const c = caps();
  const resources = active().resources;
  const any = resources.some((res) => S.res[res.id] > 0);
  const empty = document.getElementById("emptyStores");
  if (empty) empty.classList.toggle("hidden", any);

  renderPopRow(bar);

  for (const res of resources) {
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

    const atCap = S.res[res.id] >= cap - 0.01;
    attachTip(row, () => ({
      title: res.name,
      body: atCap
        ? "The store is full — anything gathered beyond this is wasted. Build to hold more."
        : "Gathered by whoever you put to the work.",
      why: rate < 0 ? "This pile is draining." : null,
    }));
  }
}

function renderPeople() {
  const tiles = document.getElementById("personTiles");
  const noun = active().popNoun;
  renderTile(tiles, "ptile-", "settler", PERSON_ICONS.settler, capWord(noun.singular), civilians(), "people",
    `An ordinary ${noun.singular}. Put them to work, or train them for something harder.`);
  for (const def of active().units) {
    if (!isRevealed(def)) continue;
    renderTile(tiles, "ptile-", def.id, PERSON_ICONS[def.id] || "", def.name, S.units[def.id] || 0, "people", def.desc);
  }

  // "Housing is full" moved into the ledger's Pop row, where the red at-cap
  // value says it without a sentence. This line now carries only the thing a
  // number can't: when the next arrival is due.
  // Emptying the text is not enough to make this disappear: the element is an
  // inline-block with its own padding, background and min-height, so a blank
  // one painted a small stray patch on the panel. It has to actually go.
  const gl = document.getElementById("growthLine");
  gl.classList.toggle("hidden", S.pop >= housing());
  if (S.pop >= housing()) {
    gl.innerHTML = "";
  } else {
    const remaining = Math.max(0, CONFIG.settlerIntervalSeconds - S.growth);
    gl.innerHTML = `Next ${noun.singular} joins in <span class="cost">${Math.ceil(remaining)}s</span>.`;
  }

  const list = document.getElementById("jobList");
  const r = rates();
  for (const job of active().jobs) {
    // A job in the manifest is normally just shown; `reveal` can defer it.
    const show = !job.reveal || S.seen["job:" + job.id] || job.reveal();
    if (show) S.seen["job:" + job.id] = true;

    let row = document.getElementById("job-" + job.id);
    if (!row) {
      if (!show) continue;
      row = document.createElement("div");
      row.className = "job";
      row.id = "job-" + job.id;
      // Two lines: the name owns the first, the rate and the stepper share the
      // second. At this column width there is no honest way to fit all three
      // on one line, and the name is the control's primary label.
      // The stepper is ONE segmented instrument -- a single bordered group with
      // internal dividers -- because two loose buttons flanking a floating
      // number read as two different kinds of control.
      row.innerHTML =
        `<span class="job-name" id="jname-${job.id}">${job.name}</span>` +
        `<span class="job-out" id="out-${job.id}"></span>` +
        `<span class="stepper-group">` +
          `<button class="stepper dec" data-job="${job.id}" data-d="-1">−</button>` +
          `<span class="job-count" id="cnt-${job.id}">0</span>` +
          `<button class="stepper inc" data-job="${job.id}" data-d="1">+</button>` +
        `</span>`;
      list.appendChild(row);
      row.querySelectorAll(".stepper").forEach((b) =>
        b.addEventListener("click", () => assign(b.dataset.job, Number(b.dataset.d))));
    }
    row.classList.toggle("hidden", !show);
    if (!show) continue;

    const n = S.jobs[job.id] || 0;
    const cnt = document.getElementById("cnt-" + job.id);
    cnt.textContent = n;
    cnt.classList.toggle("zero", n === 0);
    document.getElementById("jname-" + job.id).classList.toggle("idle", n === 0);
    // Per-job output, not the resource total -- two jobs never share a resource
    // today, but showing the job's own contribution is the honest reading.
    const own = n * CONFIG.baseRate * (job.rateMult || 1) * (mults()[job.res] || 1);
    document.getElementById("out-" + job.id).textContent = n > 0 ? fmtRate(own) : "";
    const noOne = idle() <= 0;
    row.querySelector('[data-d="-1"]').disabled = S.dead || n <= 0;
    row.querySelector('[data-d="1"]').disabled = S.dead || noOne;
    attachTip(row, () => ({
      title: job.name,
      body: job.desc || `Assign ${active().popNoun.plural} to gather ${job.res}.`,
      why: noOne && n === 0 ? "No one is idle. Take someone off other work first." : null,
    }));
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

  // Always present, empty until something is underway. (It used to hide until
  // first use, tracked by a sticky S.seen.queueUsed; the board is now whole
  // from frame one, so that flag was write-only state in every save and went
  // with it -- see design.md, "Unravel the contents, not the board".)
  const anything = S.buildQueue.length > 0 || S.expeditions.length > 0;
  emptyMsg.classList.toggle("hidden", anything);
  wrap.classList.toggle("hidden", !anything);

  const liveUids = new Set(S.buildQueue.map((q) => String(q.uid))
    .concat(S.expeditions.map((e) => "x" + e.uid)));
  Array.from(wrap.children).forEach((child) => {
    if (!liveUids.has(child.dataset.uid)) wrap.removeChild(child);
  });

  // Expedition cards: same visual language as builds, but dashed -- and no
  // cancel button, because there are no catch windows once a column marches.
  const expCards = [];
  for (const ex of S.expeditions) {
    const adv = findAdversary(ex.adversary);
    let card = wrap.querySelector(`[data-uid="x${ex.uid}"]`);
    if (!card) {
      card = document.createElement("div");
      card.className = "queue-card expedition";
      card.dataset.uid = "x" + ex.uid;
      card.innerHTML =
        `<div class="site-name">` +
          `<span class="q-icon">${QUEUE_ICONS[ex.type] || ""}</span>` +
          `<span class="q-label"></span>` +
          `<span class="b-of q-pct"></span>` +
        `</div>` +
        `<div class="progress"><span class="q-bar" style="width:0%"></span></div>` +
        `<div class="site-meta"><span class="eta q-eta"></span></div>`;
      wrap.appendChild(card);
    }
    const pct = Math.max(0, Math.min(100, (1 - ex.remaining / ex.total) * 100));
    const who = adv ? adv.name : "the road home";
    card.querySelector(".q-label").textContent =
      (ex.type === "campaign" ? "Marching on " : "Caravan to ") + who;
    card.querySelector(".q-pct").textContent = `(${Math.floor(pct)}%)`;
    card.querySelector(".q-bar").style.width = pct + "%";
    card.querySelector(".q-eta").textContent = `returns in ~${Math.max(1, Math.ceil(ex.remaining))}s`;
    expCards.push(card);
  }

  let etaAccum = 0;
  const buildCards = [];
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
          `<span class="q-icon">${QUEUE_ICONS.build}</span>` +
          `<span class="q-label"></span>` +
          `<span class="b-of q-pct"></span>` +
          `<button class="q-cancel" title="Cancel and refund">×</button>` +
        `</div>` +
        `<div class="progress"><span class="q-bar" style="width:0%"></span></div>` +
        `<div class="site-meta"><span class="eta q-eta"></span></div>`;
      wrap.appendChild(card);
      card.querySelector(".q-cancel").addEventListener("click", () => cancelBuild(item.uid));
    }
    const pct = Math.max(0, Math.min(100, (1 - item.remaining / item.total) * 100));
    // No "Raising:" / "Queued:" prefix -- the filled bar and the "~24s left"
    // line already say which item is active, and the prefix was eating the
    // name's space in a narrow column.
    card.querySelector(".q-label").textContent = def.name;
    card.querySelector(".q-pct").textContent = `(${Math.floor(pct)}%)`;
    card.querySelector(".q-bar").style.width = pct + "%";
    card.querySelector(".q-eta").textContent =
      `~${Math.max(1, Math.ceil(etaAccum / CONFIG.buildSpeed))}s left`;
    card.classList.toggle("queued", i > 0);
    buildCards.push(card);
  });

  // Expeditions read as the headline events: they sit above the builds.
  // Same only-touch-the-DOM-on-change reorder the Upgrades panel uses.
  const desired = expCards.concat(buildCards);
  const current = Array.from(wrap.children);
  if (desired.some((el, i) => el !== current[i])) {
    for (const el of desired) wrap.appendChild(el);
  }
}

// The buy menu abstracts ownership into a small number; this panel makes it
// visible at a glance -- one tile per building type you actually hold.
function renderHoldings() {
  const panel = document.getElementById("panel-holdings");
  const body = document.getElementById("holdingsBody");
  const emptyMsg = document.getElementById("holdingsEmpty");

  const buildings = active().buildings;
  const owned = buildings.filter((d) => (S.builds[d.id] || 0) > 0);
  emptyMsg.classList.toggle("hidden", owned.length > 0);
  body.classList.toggle("hidden", owned.length === 0);

  for (const def of owned) {
    renderTile(body, "hold-", def.id, BUILDING_ICONS[def.id] || "", def.name, S.builds[def.id],
      BUILDING_CATS[def.id], def.desc);
  }
}

// Buy cards update IN PLACE, never via innerHTML on the render path. The old
// per-tick `card.innerHTML = ...` destroyed the card's children five times a
// second, and a human click is not instantaneous: mousedown landed on a child
// span, the next tick replaced it before mouseup, and the browser dropped the
// click because the pressed element no longer existed -- the long-standing
// "buys take 2-3 clicks" bug, as old as the first build. The skeleton is
// built once per card; per-tick updates touch only textContent and classList,
// which never replace the element a press started on. (No description on the
// card: it lives in the tooltip, where it can afford to be longer and where
// the refusal reason can sit beside it.)
function cardSkeleton(card) {
  if (card.__skel) return card.__skel;
  card.innerHTML =
    `<div class="b-top"><span class="b-name"></span>` +
    `<span class="b-owned"><span class="bo-n"></span> <span class="b-pending hidden"></span></span></div>` +
    `<div class="b-cost"><span class="b-costs"></span><span class="b-time"></span></div>`;
  card.__skel = {
    name: card.querySelector(".b-name"),
    ownedBox: card.querySelector(".b-owned"),
    n: card.querySelector(".bo-n"),
    pending: card.querySelector(".b-pending"),
    costs: card.querySelector(".b-costs"),
    time: card.querySelector(".b-time"),
  };
  return card.__skel;
}

function setText(el, text) { if (el && el.textContent !== text) el.textContent = text; }

// parts: [{ text, short }]. The spans (and their comma separators) are only
// rebuilt when the COUNT of parts changes -- era re-pricing, capped/owned
// flips -- which is rare and never correlated with a click in flight.
function setCostParts(skel, parts) {
  const box = skel.costs;
  if (box.childElementCount !== parts.length) {
    box.innerHTML = parts.map(() => `<span></span>`).join(", ");
  }
  const spans = box.children;
  parts.forEach((p, i) => {
    const s = spans[i];
    if (!s) return;
    setText(s, p.text);
    if (s.classList) s.classList.toggle("short", !!p.short);
  });
}

function setPending(skel, count) {
  if (count > 0) {
    setText(skel.pending, `+${count}`);
    skel.pending.classList.remove("hidden");
  } else {
    skel.pending.classList.add("hidden");
  }
}

function costPartsFor(def) {
  const cost = buildCost(def);
  return Object.keys(cost).map((k) => ({ text: `${cost[k]} ${k}`, short: S.res[k] < cost[k] }));
}

function renderBuildings() {
  const panel = document.getElementById("panel-build");
  const list = document.getElementById("buildingList");
  let anyRevealed = false;
  const open = [], maxed = [];

  for (const def of active().buildings) {
    const revealed = isRevealed(def);
    let card = document.getElementById("bcard-" + def.id);
    if (revealed && !card) {
      card = document.createElement("button");
      card.className = "building";
      card.id = "bcard-" + def.id;
      // Resolve by id AT CLICK TIME, never through the captured def: a card
      // created in one era outlives it, and a stale closure would buy at the
      // old era's prices -- the Bronze-priced Archer that silently refused to
      // train in Iron. defById answers with the active era's def.
      card.addEventListener("click", () => { const d = defById(def.id); if (d) build(d); });
      list.appendChild(card);
    }
    if (!revealed) continue;
    anyRevealed = true;

    const skel = cardSkeleton(card);
    const owned = S.builds[def.id] || 0;
    const pending = pendingCount(def.id);
    const capped = isCapped(def);

    setText(skel.name, def.name);
    setText(skel.n, capped ? "Maxed" : String(owned));
    setPending(skel, capped ? 0 : pending);
    skel.ownedBox.classList.toggle("is-owned", capped);
    if (capped) {
      setCostParts(skel, [{ text: "Maxed.", short: false }]);
      setText(skel.time, "");
    } else {
      setCostParts(skel, costPartsFor(def));
      setText(skel.time, `${def.buildTime}s`);
    }
    card.disabled = S.dead || capped || !canAfford(buildCost(def));
    card.classList.toggle("owned", capped);
    attachTip(card, () => ({
      title: def.name,
      body: def.desc,
      why: capped ? "You only ever need the one." : shortfallLine(buildCost(def)),
    }));
    (capped ? maxed : open).push(card);
  }

  // Maxed buildings sink to the bottom, so what you can still raise is never
  // buried under things you're finished with. Sorted rather than split into an
  // Available/Owned pair of tabs like Upgrades, and the difference is a real
  // one: Upgrades trends toward being entirely owned, so hiding that half is
  // eventually the whole panel, while only five buildings in the game are
  // cappable at all (all cap-1) and the rest stay buyable forever. A tab
  // holding five cards would be ceremony, and it would hide useful context --
  // a maxed Barracks on screen is the reason the Training panel exists.
  // Same only-touch-the-DOM-when-the-order-changed guard as Upgrades uses.
  const desired = open.concat(maxed);
  const current = Array.from(list.children);
  if (desired.some((el, i) => el !== current[i])) {
    for (const el of desired) list.appendChild(el);
  }

  document.getElementById("buildEmpty").classList.toggle("hidden", anyRevealed);
}

// One-time upgrades: same card shell as renderBuildings, but a card locks
// permanently once owned (or already queued) instead of re-pricing upward.
function renderUpgrades() {
  const panel = document.getElementById("panel-upgrades");
  const list = document.getElementById("upgradeList");
  let anyRevealed = false;
  const buyable = [], ownedCards = [];

  for (const def of active().upgrades) {
    const revealed = isRevealed(def);
    let card = document.getElementById("bcard-" + def.id);
    if (revealed && !card) {
      card = document.createElement("button");
      card.className = "building";
      card.id = "bcard-" + def.id;
      // Resolve by id AT CLICK TIME, never through the captured def: a card
      // created in one era outlives it, and a stale closure would buy at the
      // old era's prices -- the Bronze-priced Archer that silently refused to
      // train in Iron. defById answers with the active era's def.
      card.addEventListener("click", () => { const d = defById(def.id); if (d) build(d); });
      list.appendChild(card);
    }
    if (!revealed) continue;
    anyRevealed = true;

    const cost = buildCost(def);
    const owned = !!S.upgrades[def.id];
    const pending = pendingCount(def.id) > 0;
    const skel = cardSkeleton(card);
    setText(skel.name, def.name);
    setText(skel.n, owned ? "owned" : pending ? "queued" : "");
    setPending(skel, 0);
    skel.ownedBox.classList.toggle("is-owned", owned);
    skel.ownedBox.classList.toggle("is-queued", !owned && pending);
    if (owned) {
      setCostParts(skel, [{ text: "Permanent.", short: false }]);
      setText(skel.time, "");
    } else {
      setCostParts(skel, costPartsFor(def));
      setText(skel.time, `${def.buildTime}s`);
    }
    card.disabled = S.dead || owned || pending || !canAfford(cost);
    card.classList.toggle("owned", owned);
    attachTip(card, () => ({
      title: def.name,
      body: def.desc,
      why: owned ? "Already yours — permanent." : pending ? "Already in the queue." : shortfallLine(cost),
    }));
    (owned ? ownedCards : buyable).push(card);
  }

  // Owned upgrades are FILTERED OUT of the Available tab rather than dimmed in
  // place at the bottom of one list. Sitting there at reduced contrast, they
  // read as unaffordable -- the opposite of what they are. On the Owned tab
  // they render at full contrast with a green border, because owning them is
  // an achievement rather than a refusal.
  const onOwned = upgradeTab === "owned";
  const shown = onOwned ? ownedCards : buyable;
  for (const el of buyable) el.classList.toggle("hidden", onOwned);
  for (const el of ownedCards) el.classList.toggle("hidden", !onOwned);

  // Manifest order holds within each group, and the DOM is only touched when
  // the order actually changed (an appendChild of an already-attached node
  // MOVES it, so an unconditional loop would thrash every frame).
  const desired = buyable.concat(ownedCards);
  const current = Array.from(list.children);
  if (desired.some((el, i) => el !== current[i])) {
    for (const el of desired) list.appendChild(el);
  }

  const availTab = document.getElementById("tabAvailable");
  const ownTab = document.getElementById("tabOwned");
  if (availTab) {
    availTab.textContent = buyable.length ? `Available (${buyable.length})` : "Available";
    ownTab.textContent = ownedCards.length ? `Owned (${ownedCards.length})` : "Owned";
    availTab.classList.toggle("active", !onOwned);
    ownTab.classList.toggle("active", onOwned);
  }
  const emptyMsg = document.getElementById("upgradesEmpty");
  if (emptyMsg) {
    emptyMsg.classList.toggle("hidden", !anyRevealed || shown.length > 0);
    emptyMsg.textContent = onOwned ? "Nothing owned yet." : "Everything here is already yours.";
  }
  // The tab strip is contents too: it waits until there is something to sort.
  document.getElementById("upgradeTabs").classList.toggle("hidden", !anyRevealed);
  document.getElementById("upgradesUnknown").classList.toggle("hidden", anyRevealed);
}

// Trainable person-types -- same card shell again, but the cost line also
// shows the settler(s) consumed, and unlike Construction/Upgrades this panel
// is fully hidden (not just empty) until a Barracks exists.
function renderTraining() {
  const panel = document.getElementById("panel-training");
  const list = document.getElementById("trainingList");
  let anyRevealed = false;

  for (const def of active().units) {
    const revealed = isRevealed(def);
    let card = document.getElementById("bcard-" + def.id);
    if (revealed && !card) {
      card = document.createElement("button");
      card.className = "building";
      card.id = "bcard-" + def.id;
      // Resolve by id AT CLICK TIME, never through the captured def: a card
      // created in one era outlives it, and a stale closure would buy at the
      // old era's prices -- the Bronze-priced Archer that silently refused to
      // train in Iron. defById answers with the active era's def.
      card.addEventListener("click", () => { const d = defById(def.id); if (d) build(d); });
      list.appendChild(card);
    }
    if (!revealed) continue;
    anyRevealed = true;

    const cost = buildCost(def);
    const parts = costPartsFor(def);
    if (def.popCost) {
      const noun = def.popCost > 1 ? active().popNoun.plural : active().popNoun.singular;
      parts.push({ text: `${def.popCost} ${noun}`, short: idle() < def.popCost });
    }
    const skel = cardSkeleton(card);
    setText(skel.name, def.name);
    setText(skel.n, String(S.units[def.id] || 0));
    setPending(skel, pendingCount(def.id));
    setCostParts(skel, parts);
    setText(skel.time, `${def.buildTime}s`);
    card.disabled = S.dead || !canAfford(cost) || (def.popCost && idle() < def.popCost);
    attachTip(card, () => ({
      title: def.name,
      body: def.desc,
      // Two different refusals share this card, and the population one is the
      // easier to miss -- you can be rich in wood and still have nobody spare.
      why: (def.popCost && idle() < def.popCost)
        ? `No one is free to train. A ${active().popNoun.singular} must be idle first.`
        : shortfallLine(cost),
    }));
  }

  document.getElementById("trainingEmpty").classList.toggle("hidden", anyRevealed);
}

// Your People / Settlement can each expand to fill their whole grid column
// (both rows) while their paired action-panel (Training / Construction) has
// nothing revealed yet -- an unexplained blank cell reads as a bug, a taller
// single panel reads as intentional.
// The roster panels used to stretch over their partner's empty cell, because
// the partner wasn't there yet. Every panel the era can fill is now present
// from frame one, so that case no longer arises and only the Chronicle's span
// still does any work: it runs double-height as a luxury until the world opens
// up, then yields its lower half to Expeditions.
function updateSpans() {
  const log = document.getElementById("panel-log");
  if (log) log.classList.toggle("shrunk", expeditionsUnlocked());
}

// The Expeditions panel belongs to any era whose manifest declares adversaries
// -- i.e. once the world has an outside at all. Era-scoped rather than global,
// since a later era without adversaries shouldn't show it. The Muster Ground
// gates the actions on the cards, not the existence of the panel.
function expeditionsUnlocked() {
  return active().adversaries.length > 0;
}

// Muster allocation is UI state, not game state (like `paused`): it's what
// the NEXT expedition would take. It lives in the campaign/caravan modals
// and resets every time one opens.
let muster = {};

function fightsAsLabel(adv) {
  return adv.fightsAs === "massed" ? "a massed charge"
       : adv.fightsAs === "riders" ? "a band of riders" : "a warband";
}
function advDisplayName(adv) { return adv.name.charAt(0).toUpperCase() + adv.name.slice(1); }
function stockLine(st) {
  const s = Object.keys(st.stock).filter((k) => st.stock[k] > 0)
    .map((k) => `${Math.floor(st.stock[k])} ${k}`).join(", ");
  return s ? `Known stock: ${s}.` : "Nothing left worth taking.";
}
// Wall damage is narrated, never numbered, on the card -- the numbers live in
// the campaign modal where the muster math already does.
function wallsState(adv, st) {
  if (!(adv.walls > 0)) return "";
  if (st.walls <= 0) return " Their walls lie in ruin.";
  if (st.walls < adv.walls) return " Their walls are battered.";
  return "";
}

// Stepper rows shared by the campaign and caravan modals. `prefix` keeps the
// two modals' element ids distinct; wiring clamps against live availability
// (the game does not pause for modals, so "what's home" can change under you).
function musterRowsHTML(prefix) {
  return active().units.filter(isRevealed).map((def) =>
    // Same two-line row and same segmented stepper as job assignment: the
    // player already learned this control in the first minute, and mustering a
    // column is the same verb as assigning labour pointed somewhere else.
    `<div class="job">` +
      `<span class="job-name">${pluralize(def.name)}</span>` +
      `<span class="job-out" id="${prefix}avail-${def.id}"></span>` +
      `<span class="stepper-group">` +
        `<button class="stepper dec" data-mid="${def.id}" data-d="-1">−</button>` +
        `<span class="job-count" id="${prefix}cnt-${def.id}">0</span>` +
        `<button class="stepper inc" data-mid="${def.id}" data-d="1">+</button>` +
      `</span>` +
    `</div>`).join("");
}
function wireMusterRows(bodyEl, refresh) {
  bodyEl.querySelectorAll(".stepper").forEach((b) => b.addEventListener("click", () => {
    const id = b.dataset.mid, d = Number(b.dataset.d);
    muster[id] = Math.max(0, Math.min(availableUnits(id), (muster[id] || 0) + d));
    refresh();
  }));
}
function refreshMusterRows(prefix) {
  for (const def of active().units) {
    const cnt = document.getElementById(prefix + "cnt-" + def.id);
    if (!cnt) continue;
    muster[def.id] = Math.max(0, Math.min(availableUnits(def.id), muster[def.id] || 0));
    cnt.textContent = muster[def.id] || 0;
    const avail = document.getElementById(prefix + "avail-" + def.id);
    if (avail) avail.textContent = `${availableUnits(def.id)} home`;
  }
  return Object.values(muster).reduce((a, b) => a + b, 0);
}
function confirmButton() {
  const btns = document.querySelectorAll("#modalActions button");
  return btns.length ? btns[btns.length - 1] : null;
}

// The campaign is a decision worth a ceremony: the modal carries the
// target's description (which IS the strength hint -- see design.md, flavor
// is load-bearing), the muster, and a live estimate.
function openCampaignModal(advId) {
  const adv = findAdversary(advId);
  const st = S.adversaries[advId];
  if (!adv || !st) return;
  muster = {};
  const body =
    `<p class="modal-lead">${adv.desc}</p>` +
    `<div class="exp-status">${adv.disposition} · ${standingWord(st.standing)} · strength ${adv.strength}, ` +
      `fights as ${fightsAsLabel(adv)}. ${stockLine(st)}</div>` +
    `<h3 class="info-h">Muster the column</h3>` +
    `<div class="muster">${musterRowsHTML("cm")}</div>` +
    `<div class="exp-status" id="cmEstimate"></div>` +
    `<div class="exp-status">Provisions: ${CONFIG.campaignFoodCost} food · ${adv.campaignTime}s there and back.</div>`;
  openModal(`Campaign: ${advDisplayName(adv)}`, body, [
    { label: "Stay home", onClick: closeModal },
    { label: "March", danger: true, onClick: () => {
        launchCampaign(advId, muster);
        if (expeditionOut("campaign")) closeModal();
      } },
  ], (bodyEl) => {
    const refresh = () => {
      const total = refreshMusterRows("cm");
      const est = document.getElementById("cmEstimate");
      if (est) {
        const wallsBit = st.walls > 0
          ? ` Their walls stand at ${Math.ceil(st.walls)} — your column brings wall-power ${wallPower(muster).toFixed(1)}.`
          : "";
        est.textContent = total < 1 ? "Muster at least one fighter."
          : `Your ${total} march at strength ${campaignStrength(muster, adv).toFixed(1)}, against theirs of ${adv.strength}.${wallsBit}`;
      }
      const march = confirmButton();
      if (march) march.disabled = S.dead || total < 1 ||
        S.res.food < CONFIG.campaignFoodCost || expeditionOut("campaign");
    };
    wireMusterRows(bodyEl, refresh);
    refresh();
  });
}

// Only exists while the roads are dangerous -- on safe roads a caravan is a
// one-click send, and the escort question doesn't arise.
function openCaravanModal(advId) {
  const adv = findAdversary(advId);
  const st = S.adversaries[advId];
  const raiders = riskAdversary();
  if (!adv || !adv.buys || !st || !raiders) return;
  muster = {};
  const premium = st.standing >= 2 ? 1.25 : 1;
  const wouldPay = Math.min(Math.floor(adv.buys.pays * premium), Math.floor(st.stock.gold || 0));
  const body =
    `<p class="modal-lead">The roads are not safe — ${raiders.name} prowl them. An escort won't keep a caravan from being found; it decides what happens when it is.</p>` +
    `<div class="exp-status">Exchange: ${adv.buys.amount} ${adv.buys.res} → ${wouldPay} gold · ${adv.caravanTime}s round trip.</div>` +
    `<h3 class="info-h">Escort (optional)</h3>` +
    `<div class="muster">${musterRowsHTML("cv")}</div>` +
    `<div class="exp-status" id="cvEstimate"></div>`;
  openModal(`Caravan: ${advDisplayName(adv)}`, body, [
    { label: "Hold the caravan", onClick: closeModal },
    { label: "Send it", onClick: () => {
        launchCaravan(advId, muster);
        if (expeditionOut("caravan")) closeModal();
      } },
  ], (bodyEl) => {
    const refresh = () => {
      const total = refreshMusterRows("cv");
      const est = document.getElementById("cvEstimate");
      if (est) {
        est.textContent = total < 1
          ? "Unescorted: if the roads find it, the cargo is gone."
          : `Escort of ${total}, strength ${campaignStrength(muster, raiders).toFixed(1)} against raiders at ${raiders.strength}.`;
      }
      const send = confirmButton();
      if (send) send.disabled = S.dead || expeditionOut("caravan");
    };
    wireMusterRows(bodyEl, refresh);
    refresh();
  });
}

function renderExpeditions() {
  const panel = document.getElementById("panel-expeditions");
  if (!panel) return;
  const open = expeditionsUnlocked();
  panel.classList.toggle("hidden", !open);
  if (!open) return;

  // Prose status only -- the countdowns and progress bars live in the
  // Underway (queue) panel, where in-progress things belong.
  const campaignAway = expeditionOut("campaign");
  const caravanAway = expeditionOut("caravan");
  const status = document.getElementById("expeditionStatus");
  const parts = [];
  if (campaignAway) parts.push("A campaign is in the field.");
  if (caravanAway) parts.push("A caravan is on the road.");
  if (!parts.length) {
    parts.push((S.builds.musterGround || 0) >= 1
      ? "The Muster Ground stands ready."
      : "You know your neighbors, but you have no one to send. A Muster Ground would change that.");
  }
  status.textContent = parts.join(" ");

  // One card per adversary: who they are, what's left of them, what you can do.
  const list = document.getElementById("adversaryList");
  for (const adv of active().adversaries) {
    const st = S.adversaries[adv.id];
    if (!st) continue;
    let card = document.getElementById("adv-" + adv.id);
    if (!card) {
      card = document.createElement("div");
      card.className = "adv-card";
      card.id = "adv-" + adv.id;
      card.innerHTML =
        `<div class="b-top"><span class="b-name" id="advname-${adv.id}"></span>` +
        `<span class="b-owned" id="advstand-${adv.id}"></span></div>` +
        `<div class="b-desc" id="advdesc-${adv.id}"></div>` +
        `<div class="b-desc adv-stock" id="advstock-${adv.id}"></div>` +
        `<div class="adv-actions">` +
          `<button class="modal-btn" id="advmarch-${adv.id}"></button>` +
          `<button class="modal-btn" id="advtrade-${adv.id}"></button>` +
        `</div>`;
      list.appendChild(card);
      document.getElementById(`advmarch-${adv.id}`).addEventListener("click", () => openCampaignModal(adv.id));
      document.getElementById(`advtrade-${adv.id}`).addEventListener("click", () => {
        if (hostileRouteRisk()) openCaravanModal(adv.id);
        else launchCaravan(adv.id);
      });
    }

    document.getElementById(`advname-${adv.id}`).textContent = advDisplayName(adv);
    document.getElementById(`advstand-${adv.id}`).textContent =
      `${adv.disposition} · ${standingWord(st.standing)}`;
    document.getElementById(`advdesc-${adv.id}`).textContent =
      `${adv.desc} Strength ${adv.strength}, fights as ${fightsAsLabel(adv)}.`;
    document.getElementById(`advstock-${adv.id}`).textContent = stockLine(st) + wallsState(adv, st);

    // The panel now stands before the Muster Ground does, so both verbs gate on
    // it here rather than the whole panel gating on it. Reading the neighbours
    // before you can act on them is the point: the cards are the recruiting
    // poster for the building.
    const noMuster = (S.builds.musterGround || 0) < 1;

    const march = document.getElementById(`advmarch-${adv.id}`);
    march.textContent = `March (${CONFIG.campaignFoodCost} food, ${adv.campaignTime}s)`;
    march.disabled = S.dead || campaignAway || noMuster;
    march.title = noMuster ? "You have nowhere to muster a column. Build a Muster Ground." :
      campaignAway ? "A campaign is already in the field." : "";

    const trade = document.getElementById(`advtrade-${adv.id}`);
    if (adv.buys) {
      const premium = st.standing >= 2 ? 1.25 : 1;
      const wouldPay = Math.min(Math.floor(adv.buys.pays * premium), Math.floor(st.stock.gold || 0));
      trade.classList.remove("hidden");
      trade.textContent = `Caravan: ${adv.buys.amount} ${adv.buys.res} → ${wouldPay} gold (${adv.caravanTime}s)`;
      trade.disabled = S.dead || caravanAway || noMuster || st.standing <= -2 || wouldPay <= 0 ||
        (S.res[adv.buys.res] || 0) < adv.buys.amount;
      trade.title = noMuster ? "You have no one to send. Build a Muster Ground." :
        caravanAway ? "A caravan is already on the road." :
        st.standing <= -2 ? "They remember your raids. They will not trade with you." :
        wouldPay <= 0 ? "They have no gold left to pay with." :
        (S.res[adv.buys.res] || 0) < adv.buys.amount ? `Not enough ${adv.buys.res}.` :
        hostileRouteRisk() ? "The roads are dangerous — you'll be offered an escort." : "";
    } else {
      trade.classList.add("hidden");
    }
  }
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
  // Every modal starts from the same clean stock; a caller that wants ruled
  // ground (Info) adds it in its own onMount rather than leaving it behind for
  // whichever modal opens next.
  body.classList.remove("ruled-graph");

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
// Each tab reads straight from that era's compiled manifest, so a Bronze tab
// shows Bronze names and descs even while you're still in the Stone Age.
function infoPanelHTML() {
  const tabs = ERA_ORDER.map((e) =>
    `<button class="info-tab${e === S.era ? " active" : ""}" data-era="${e}">${MANIFESTS[e].name}</button>`
  ).join("");

  const sections = ERA_ORDER.map((e) => {
    const m = MANIFESTS[e];
    // Ruled ground, boxed content, strong section markers. That combination is
    // what makes a dense reference skimmable: the eye jumps by heading, then
    // lands in a box instead of a wall. Two columns, because these entries are
    // short and a single column of them scrolls forever.
    const group = (label, items) => {
      if (!items.length) return "";
      return `<h3 class="info-h">${label}</h3><div class="info-grid">` + items.map((d) =>
        `<div class="info-item">` +
          `<div class="info-top"><span class="info-name">${d.name}</span>` +
          (d.costLine ? `<span class="info-cost">${d.costLine}</span>` : "") + `</div>` +
          `<div class="info-desc">${d.desc}</div>` +
        `</div>`
      ).join("") + `</div>`;
    };
    // The reference is the one place costs are shown for things you may not
    // have revealed yet -- it exists to answer "what does this age hold".
    // Each cost is its own span so the line can break at the commas between
    // them without ever splitting "400 food" across two lines.
    const priced = (items) => items.map((d) => Object.assign({}, d, {
      costLine: d.base
        ? Object.keys(d.base).map((k) => `<span>${d.base[k]} ${k}</span>`).join(", ") +
          (d.buildTime ? ` <span>· ${d.buildTime}s</span>` : "")
        : null,
    }));
    const neighbors = m.adversaries.map((a) => ({
      name: a.name.charAt(0).toUpperCase() + a.name.slice(1), desc: a.desc,
    }));
    const inner = group("Buildings", priced(m.buildings)) + group("People", priced(m.units)) +
      group("Upgrades", priced(m.upgrades)) + group("Neighbors", neighbors);
    return `<div class="info-era${e === S.era ? "" : " hidden"}" data-era="${e}">${inner}</div>`;
  }).join("");

  return `<div class="info-tabs">${tabs}</div>${sections}`;
}

function openInfoPanel() {
  openModal(`Reference · ${active().name}`, infoPanelHTML(), null, (body) => {
    body.classList.add("ruled-graph");
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

// Hand-authored per era: ONLY the flavor lead. Every list underneath -- what
// changed, what's newly available, what's no longer needed -- derives from
// the manifest diff, so none of it can go stale as content moves. Every age
// is supposed to land as a visible "whoa, look at this" moment (design.md);
// the lead is where that voice lives, the diff is where the facts do.
const ERA_TRANSITIONS = {
  bronze: {
    lead: "Copper and tin are married in fire. The first bronze is poured, and everything your people know how to make changes with it.",
  },
  iron: {
    lead: "The far mines fall silent and the bronze roads empty. What replaces them is nearer, harder, and everywhere — and the world, it turns out, is full of neighbors.",
  },
};

function openEraModal(era, before) {
  const t = ERA_TRANSITIONS[era];
  if (!t) return;
  const pi = ERA_ORDER.indexOf(era) - 1;
  const prevM = pi >= 0 ? MANIFESTS[ERA_ORDER[pi]] : null;
  const m = MANIFESTS[era];
  const diff = manifestDiff(prevM, m);

  // "What changed": renames, era-scoped value shifts, and new resources/jobs
  // (which have no buy-card, so they'd otherwise go unannounced).
  const changes = diff.renamed.map((r) => `The ${r.from.name} is now the ${r.to.name}.`);
  if (prevM && prevM.popNoun.plural !== m.popNoun.plural) {
    changes.push(`You count your people in ${m.popNoun.plural} now.`);
  }
  if (before.housing !== housing()) changes.push(`Housing rises from ${before.housing} to ${housing()}.`);
  if (prevM) {
    for (const panelId in m.panelTitles) {
      if (prevM.panelTitles[panelId] && prevM.panelTitles[panelId] !== m.panelTitles[panelId]) {
        changes.push(`The ${prevM.panelTitles[panelId]} is now a ${m.panelTitles[panelId]}.`);
      }
    }
    const newRes = m.resources.filter((r) => !prevM.resources.some((p) => p.id === r.id));
    if (newRes.length) changes.push(`New resources: ${newRes.map((r) => r.name).join(", ")}.`);
    const newJobs = m.jobs.filter((j) => !prevM.jobs.some((p) => p.id === j.id));
    if (newJobs.length) changes.push(`New work: ${newJobs.map((j) => j.name.toLowerCase()).join(", ")}.`);
  }

  const unlocked = diff.added.map((d) => `${d.name} — ${d.desc}`);
  const retired = diff.removed.map((d) => d.name);

  // The three lists are three different shapes of information, so they get
  // three different treatments rather than one bulleted list doing all the
  // work. "Now available" is the one you'll actually shop from, so it reuses
  // the reference's boxed grid; the other two are read once and dismissed.
  const list = (items) => `<ul class="era-list">${items.map((i) => `<li>${i}</li>`).join("")}</ul>`;
  const boxes = (items) => `<div class="info-grid">` + items.map((d) =>
    `<div class="info-item">` +
      `<div class="info-top"><span class="info-name">${d.name}</span></div>` +
      `<div class="info-desc">${d.desc}</div>` +
    `</div>`).join("") + `</div>`;
  const chips = (names) => `<div class="era-chips">` +
    names.map((n) => `<span class="era-chip">${n}</span>`).join("") + `</div>`;

  let html = `<p class="modal-lead">${t.lead}</p>`;
  if (changes.length) html += `<h3 class="info-h">What changed</h3>${list(changes)}`;
  if (unlocked.length) html += `<h3 class="info-h">Now available</h3>${boxes(diff.added)}`;
  if (retired.length) html += `<h3 class="info-h">No longer needed</h3>${chips(retired)}`;

  // No action buttons -- dismiss via the ×, the backdrop, or Escape.
  openModal(`The ${m.name} Begins`, html);
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
  // Boxed, so the run's numbers read as a record rather than a receipt.
  const stat = (label, val) =>
    `<div class="stat-box"><span class="s-lbl">${label}</span><span class="s-val">${val}</span></div>`;
  const stats =
    `<div class="modal-stats">` +
      stat("Time survived", fmtTime(S.playtime || 0)) +
      stat("Age reached", active().name) +
      stat("Buildings raised", built) +
      stat("Arrivals welcomed", S.bought) +
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

// Speed is a lens, never a cheat: the loop runs `speed` ordinary steps per tick
// rather than one oversized one, which is exactly how simulateOffline() already
// compresses time. Every rate, probability roll, build tick and upkeep charge
// therefore behaves identically to real time -- there is just more of it per
// second. Nothing needs to know it's happening.
function renderSpeed() {
  const btn = document.getElementById("speedBtn");
  if (!btn) return;
  btn.textContent = `${speed}×`;
  btn.classList.toggle("fast", speed > 1);
}

function cycleSpeed() {
  if (S.dead) return;
  const i = CONFIG.speeds.indexOf(speed);
  speed = CONFIG.speeds[(i + 1) % CONFIG.speeds.length];
  renderSpeed();
}

function setPaused(p) {
  if (S.dead) return;
  paused = p;
  const btn = document.getElementById("pauseBtn");
  if (btn) btn.textContent = paused ? "Resume" : "Pause";
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
  const badgeText = document.getElementById("ageBadgeText");
  if (badgeText) badgeText.textContent = active().name;
  // The desk under the board changes per era, and the header chrome inverts
  // with it. Driving both off one attribute keeps the whole swap in CSS.
  if (document.body) document.body.dataset.era = S.era;
  const titles = active().panelTitles;
  for (const panelId in titles) {
    const h2 = document.querySelector(`#${panelId} h2`);
    if (h2) h2.textContent = titles[panelId];
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
  renderExpeditions();
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
  S.eraHistory = data.eraHistory || {};
  S.adversaries = data.adversaries || {};
  S.expeditions = Array.isArray(data.expeditions) ? data.expeditions : [];
  S.buildQueue = Array.isArray(data.buildQueue) ? data.buildQueue : [];
  return true;
}

// Give every adversary of the ACTIVE era its living state entry if it doesn't
// have one yet -- called at boot and on era entry. Never re-initializes: a
// half-plundered stock stays half-plundered across save/load.
function initAdversaries() {
  for (const adv of active().adversaries) {
    if (!S.adversaries[adv.id]) {
      S.adversaries[adv.id] = { stock: Object.assign({}, adv.stock), standing: 0, walls: adv.walls || 0 };
    } else if (S.adversaries[adv.id].walls === undefined) {
      // Saves from before fortifications existed get their walls raised once.
      S.adversaries[adv.id].walls = adv.walls || 0;
    }
  }
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
  if (g.pop > 0) parts.push(`${g.pop} new ${g.pop > 1 ? active().popNoun.plural : active().popNoun.singular}`);
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
    log(`You return to a changed people — the ${active().name} began in your absence.`, "big");
  }
}

// ---------- Boot --------------------------------------------
function boot() {
  const had = load();
  initAdversaries();

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
  document.getElementById("speedBtn").addEventListener("click", cycleSpeed);
  renderSpeed();
  document.getElementById("tabAvailable").addEventListener("click", () => { upgradeTab = "available"; renderUpgrades(); });
  document.getElementById("tabOwned").addEventListener("click", () => { upgradeTab = "owned"; renderUpgrades(); });
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
    // The clamp is applied BEFORE the multiplier, deliberately: clamping is
    // about the browser having been descheduled, and speed is about how fast
    // we want to watch. Scaling the clamp would let a background tab bank time
    // and hand it back multiplied.
    for (let i = 0; i < speed; i++) step(dt);
    checkReveals();
    renderAll();
  }, CONFIG.tickMs);

  // Autosave keeps running while paused, deliberately: it refreshes lastSeed,
  // so time spent paused is never mistaken for offline time on the next load.
  saveId = setInterval(save, 10000);
  window.addEventListener("beforeunload", save);
}

boot();
