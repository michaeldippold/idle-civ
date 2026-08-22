import { caps } from "../core/derived.js";
import { S } from "../core/state.js";

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
export const STONE = {
  name: "Stone Age",
  housingPerHut: 3,
  panelTitles: { "panel-holdings": "Settlement" },
  // What one unit of population MEANS this era (see design.md, Unit
  // Re-denomination): the number on screen stays small forever; this noun is
  // what scales. Inherited unless an era re-denominates.
  popNoun: { singular: "settler", plural: "settlers" },
  // How population grows (phase 6b): "timer" = free arrivals while housing
  // has room; "conquest" = only by taking or winning places (Iron onward).
  // The first core verb to re-denominate rather than merely reflavor.
  growth: "timer",
  // The chart exists from the first frame (user ruling, 2026-08-22): the map
  // walks back to Stone as a purely visual surface, so there is ONE layout
  // for the whole game and the transition from "neat map" to "main game
  // surface" is continuity, not a reveal. A tile is a clearing here and
  // stays one through Bronze -- same noun, same world, no regeneration
  // until Iron recuts at holdfast scale.
  map: {
    radius: 3,
    tileNoun: { singular: "clearing", plural: "clearings" },
    terrains: ["plains", "forest", "hills", "river", "water"],
    seats: [],
  },
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

