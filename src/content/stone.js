import { caps } from "../core/derived.js";
import { S } from "../core/state.js";
import { MINOR_PLACES, SEAT_IDS } from "./lib.js";

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
  panelTitles: { "panel-holdings": "Settlement" },
  // What one unit of population MEANS this era (see design.md, Unit
  // Re-denomination): the number on screen stays small forever; this noun is
  // what scales. Inherited unless an era re-denominates.
  popNoun: { singular: "settler", plural: "settlers" },
  // How population grows (phase 6b): "timer" = free arrivals while housing
  // has room; "conquest" = only by taking or winning places (Iron onward).
  // The first core verb to re-denominate rather than merely reflavor.
  // The chart exists from the first frame (user ruling, 2026-08-22): the map
  // walks back to Stone as a purely visual surface, so there is ONE layout
  // for the whole game and the transition from "neat map" to "main game
  // surface" is continuity, not a reveal. A tile is a clearing here and
  // stays one through Bronze; Iron re-denominates it to `holdfast` without
  // touching the ground underneath.
  //
  // ONE BOARD, FOREVER (map.md 2.6). The radius is the same in every era and
  // the world is never regenerated: what changes across the ages is what you
  // can SEE (fog) and what you can DO, never what the world IS. The era `view`
  // radius that used to hard-filter rendering is gone -- it made the world
  // literally grow, which meant the board a player learned in Bronze was
  // thrown away at Iron, and you cannot re-dress ground you regenerate.
  map: {
    tileNoun: { singular: "clearing", plural: "clearings" },
    terrains: ["plains", "forest", "hills", "river", "water"],
    seats: SEAT_IDS,
    // Carrying capacity per terrain (engine rework E1): how many people the
    // ground supports. Small at Stone ON PURPOSE -- caps are the era
    // production curve (a ceiling change, never a rate change), and these
    // numbers keep a 2-3 hex Stone endgame near today's 15-25 people. Water
    // holds no one and is deliberately absent: a missing terrain means cap 0.
    popCaps: { plains: 8, river: 10, forest: 5, hills: 3 },
    // What claiming adjacent land costs (owner ruling, 2026-08-24, from the
    // all-food dominance run): a settling party carries provisions, timber
    // AND tools -- a single-resource price let one export fund the whole
    // conquest. Every component escalates per claim (claimScale) and scales
    // by the route. (The old food-only rationale -- "affordable before wood
    // exists" -- died with the steppers: any hex works wood from minute one.)
    claim: { cost: { food: 20, wood: 8, stone: 4 }, time: 30 },
    // The DOMINION CAP (owner ruling, 2026-08-24, second 5-minute test):
    // what one age can HOLD is the era's scope, and no cost curve can brake
    // what compounding production funds -- claims buy production, so any
    // price is a treadmill. A stone chief holds seven clearings; holding
    // more IS what an era advance means. This also hands the mid-era game
    // to DEVELOPMENT: once the land is held, buildings are the sink.
    dominionCap: 7,
    // The neighbours are on the board FROM THE FIRST MINUTE (owner ruling,
    // 2026-08-24). They were an Iron-age arrival until then, which meant the
    // world you spent most of a run looking at was uninhabited, and it also
    // meant a hex you scouted empty could sprout a village at the era flip --
    // the one unresolved contradiction in the fog design. Same sites, same
    // people, every age; only the dressing and the strength change.
    minors: {
      density: 0.06,          // IDENTICAL in every era, or the sites move
      names: MINOR_PLACES,    // ditto: the pool's length places them
      // The era supplies the settlement noun. See MINOR_PLACES.
      form: "the camp at %s",
      // Stone-scale: a dozen people behind a thorn fence, and no walls in an
      // age with no masonry. Majors sit strictly above this band -- that is
      // what the major/minor tier IS (owner ruling, 2026-08-24), and without
      // it the two words describe nothing.
      strength: [1, 3],
      walls: [0, 0],
      stock: { food: [5, 20], wood: [3, 12] },
    },
    // What each terrain can be turned to, from the FIRST minute (E2): one
    // assignment per hex, terrain sets the rate, every ground works
    // everything at a price. The Stone table is the Iron table minus iron --
    // the permanent shape, learned on day one.
    works: {
      plains: { food: 1.0, wood: 0.4, stone: 0.3 },
      river:  { food: 1.2, wood: 0.3, stone: 0.2 },
      forest: { wood: 1.0, food: 0.5, stone: 0.2 },
      hills:  { stone: 1.0, food: 0.3, wood: 0.3 },
    },
  },
  arrivalLine: "A wanderer joins your settlement.",

  resources: [
    { id: "food",  name: "Food",  baseCap: 50, capBuilding: "granary"  },
    { id: "wood",  name: "Wood",  baseCap: 50, capBuilding: "woodshed" },
    { id: "stone", name: "Stone", baseCap: 50, capBuilding: "stoneYard" },
  ],

  buildings: [
    // The Hut died in E3 with the housing system: people live on the land
    // now, and the land's carrying capacity is the ceiling. The founding
    // building's reveal-spine role passed to THE CLAIM -- your dominion
    // growing is what opens the tree.
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
      reveal: () => S.map && S.map.owned.length >= 4,
    },
    {
      id: "lumberCamp", name: "Lumber Camp", kind: "building", desc: "Woodcutters gather +12% wood.",
      base: { wood: 18, stone: 10 }, scale: 1.5, buildTime: 24,
      reveal: () => S.map && S.map.owned.length >= 4,
    },
    {
      id: "stonePit", name: "Stone Pit", kind: "building", desc: "Gatherers mine +12% stone.",
      base: { wood: 20, stone: 12 }, scale: 1.5, buildTime: 24,
      reveal: () => S.map && S.map.owned.length >= 5,
    },
    {
      // "Medicine Tent" here so that "Infirmary" is available as this same
      // building's Bronze-era name (an override, not a new def). Id never changes.
      id: "infirmary", name: "Medicine Tent", kind: "building", desc: "Reduces the chance sickness claims a life.",
      base: { wood: 24, stone: 8 }, scale: 1.5, buildTime: 20,
      reveal: () => S.map && S.map.owned.length >= 4,
    },
    {
      id: "barracks", name: "Barracks", kind: "building", cap: 1,
      desc: "Lets your people train as Soldiers.",
      base: { wood: 40, stone: 15 }, scale: 1.5, buildTime: 30,
      reveal: () => S.map && S.map.owned.length >= 4,
    },
  ],

  upgrades: [
    {
      id: "stoneTools", name: "Stone Tools", kind: "upgrade",
      desc: "Permanently improves all gathering by 8%.",
      base: { wood: 10 }, buildTime: 10,
      reveal: () => S.res.wood >= 5,
    },
    {
      id: "fireMastery", name: "Fire Mastery", kind: "upgrade",
      desc: "Permanently reduces food upkeep by 15%.",
      base: { wood: 30, food: 10 }, buildTime: 25,
      reveal: () => S.map && S.map.owned.length >= 4,
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
      reveal: () => S.pop >= 25 && (S.units.soldier || 0) >= 1,
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

  // CONTACT: what this age can do about its neighbours, in either direction.
  // "none" is not a rule forbidding war -- it is the absence of anyone able to
  // declare one (owner ruling, 2026-08-24): "there are no kings in the stone
  // age to send campaigns, that's incoherent because they don't exist yet.
  // It'll be dudes in rough clothing with spears." So the neighbours are
  // visible, scoutable and untouchable, and the Expeditions panel stays shut.
  //
  // Stone still has DANGER, and always did: all three raidTypes roll and the
  // `conflict` event fires. That danger is simply ANONYMOUS -- a warband out
  // of the dark, belonging to no one on your map. Bronze is where it gets a
  // name and an address.
  contact: "none",
  // Nothing to muster with, and no one to muster. See `contact` above.
  muster: null,

  // The neighbours as they are in an age without metal: camps. Same ids, same
  // ground, same people as the Iron Age powers they become -- an era slate is
  // wholesale (never inherited), which makes redressing them per age the
  // manifest model's native trick rather than a new mechanism.
  //
  // Strictly above the minor band ([1,3]) and strictly below their own Bronze
  // selves. Nobody here has walls; nobody here has gold to trade.
  adversaries: [
    {
      id: "hillClans", name: "the hill camps", disposition: "warlike",
      homeTerrain: "hills",
      strength: 5, walls: 0, fightsAs: "massed", campaignTime: 90,
      stock: { food: 30, wood: 20 },
      desc: "Smoke on the high ridges, most mornings. They have spears, they know the passes, and they have watched you longer than you have watched them.",
    },
    {
      id: "riverKingdom", name: "the river camps", disposition: "peaceful",
      homeTerrain: "river",
      strength: 6, walls: 0, fightsAs: "riders", campaignTime: 120,
      stock: { food: 45, wood: 25 },
      desc: "Fishing camps strung along the water downstream, thick with drying racks. There are more of them than there are of you, and the river feeds them without asking.",
    },
    {
      id: "saltNomads", name: "the salt wanderers", disposition: "peaceful",
      homeTerrain: "plains",
      strength: 4, walls: 0, fightsAs: "riders", campaignTime: 75,
      stock: { food: 25, wood: 10 },
      desc: "They follow the herds across the flats and are gone before you find their fires. Twice now, someone has left a gift of salt at the edge of your clearing.",
    },
  ],

  events: ["greatHunt", "trader", "sickness", "conflict"],
  hints:  ["wood", "stone", "build", "tools", "rotFood", "rotWood", "rotStone",
           "sicknessWarn", "conflictWarn", "bronzeAvailable"],
};

