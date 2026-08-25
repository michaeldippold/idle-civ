import { S } from "../core/state.js";
import { MINOR_PLACES, SEAT_IDS } from "./lib.js";

// ---------- The Bronze Age (delta) --------------------------
// Everything the Bronze Age changes about the world, and nothing else.
// Reading this delta IS reading the era's design: huts become stone houses
// and hold more, the healers get a real building, ores and the Forge arrive,
// two unit types join, the capstone that got us here is retired.
export const BRONZE_DELTA = {
  name: "Bronze Age",
  panelTitles: { "panel-holdings": "Village" },
  // The first re-denomination is a pure 1:1 relabel: your settlers started
  // families. Counts, thresholds and balance are untouched -- only the words.
  popNoun: { singular: "family", plural: "families" },
  // Still 1, deliberately: the first border consolidates nothing (design.md),
  // Bronze keeps the clearing, and the topline should agree.
  soulsPerPerson: 1,
  arrivalLine: "A family seeks shelter here, and stays.",
  // Bronze redeclares the map wholesale (map specs copy, never merge) to
  // put the ores on the ground: hills carry copper and tin -- tin at the
  // scarce half-rate, which is both a real balance lever and why bronze was
  // worth building trade routes over. A whisper of both on plains keeps a
  // hills-poor start slow rather than dead.
  map: {
    radius: 4,
    tileNoun: { singular: "clearing", plural: "clearings" },
    terrains: ["plains", "forest", "hills", "river", "water"],
    seats: SEAT_IDS,
    popCaps: { plains: 12, river: 15, forest: 8, hills: 5 },
    // The claim carries the age's SIGNATURE resource (owner ruling,
      // 2026-08-24) -- the capstone pricing rule, applied to the frontier:
      // a bronze-age party leaves with bronze fittings. Small next to the
      // base three, but it means no era's economy can be skipped while the
      // dominion keeps growing on food and timber alone.
      claim: { cost: { food: 30, wood: 15, stone: 8, bronze: 3 }, time: 35 },
      dominionCap: 12,
    // The same fourteen places, one age older. Density and pool length are
    // IDENTICAL to Stone's by construction (both read the shared list), which
    // is what keeps every steading on the hex it has always been on.
    minors: {
      density: 0.06,
      names: MINOR_PLACES,
      form: "the steading at %s",
      // Grown, and still strictly under the weakest Bronze major.
      strength: [2, 5],
      walls: [0, 2],
      stock: { food: [15, 45], wood: [8, 25], bronze: [2, 8] },
    },
    // Unchanged from Stone: bare ground yields what it is, in every age.
    // Bronze does not make the hills yield copper -- it teaches you to MINE
    // them (see structures). The alloy economy is a thing you build, not a
    // thing the ground starts doing because the calendar turned.
    yields: {
      plains: { res: "food",  rate: 1.0 },
      river:  { res: "food",  rate: 1.3 },
      forest: { res: "wood",  rate: 1.0 },
      hills:  { res: "stone", rate: 1.0 },
    },
  },

  remove: ["bronzeAge"],

  override: {
    // THE ERA IS THE BUDGET (4c): flat caps sized just above this age's
    // capstone (ironAge wants 400 of each), food higher by law.
    food:  { baseCap: 600 },
    wood:  { baseCap: 550 },
    stone: { baseCap: 550 },
    infirmary:  { name: "Infirmary" },
    herbalMedicine: { desc: "Increases how much each Infirmary reduces the chance sickness claims a life." },
  },

  add: {
    resources: [
      // Present-in-era resources reveal immediately (`() => true`): the
      // manifest is the gate now, where an S.era check used to be.
      // The ores buffer a converter rather than fund a budget -- small caps,
      // no storage (the Ore Yard died with the rest of the line in 4c).
      { id: "copper", name: "Copper", baseCap: 50,  reveal: () => true },
      { id: "tin",    name: "Tin",    baseCap: 50,  reveal: () => true },
      // Bronze is spent on upgrades rather than stockpiled, so it gets a
      // generous ceiling.
      { id: "bronze", name: "Bronze", baseCap: 200, reveal: () => true },
    ],
    buildings: [
      {
        // Bronze's answer to the Muster Ground, and deliberately smaller in
        // every dimension: cheaper, quicker, and it sends four people rather
        // than an army. Without it, `contact: "open"` was a lie -- the March
        // button appeared at Bronze and sat permanently disabled behind a
        // building that does not exist until Iron, which is the same
        // incoherence the owner objected to, merely relocated.
        id: "warCamp", name: "War Camp", kind: "building", cap: 1,
        desc: "A ring of hide tents and a fire kept lit. Enough to send a few spears over the hill and expect most of them back.",
        base: { wood: 35, stone: 15, bronze: 8 }, scale: 1.5, buildTime: 24,
        reveal: () => S.builds.barracks >= 1,
      },
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
        // The first building that TRANSFORMS rather than produces or boosts.
        // No workers: the opportunity cost is already paid by the miners
        // feeding it, and "would you like to stop smelting?" isn't an
        // interesting choice when neither input has another use.
        //
        // RATE 0.20, up from 0.05 (owner playtest, 2026-08-25). At 0.05 a
        // forge drew 0.2 copper/s against a hills hex producing 5/s -- FOUR
        // PERCENT of it -- so twenty-five forges were needed to consume one
        // hex, and the owner ran six while copper and tin both sat CAPPED and
        // overflowing at +1.26/s and +0.31/s. The ore was free and the straw
        // was the whole game. One forge took 65 minutes to fund a Bronze Age;
        // building three or four was not a choice, it was a tax.
        //
        // The number is set so the ore economy BINDS instead: three forges
        // (2.4 copper/s) draw about what a worked hills hex yields, so how
        // many are worth building is a real question with a real answer --
        // how much hill country you hold, and what you gave up to work it.
        //
        // SCALE 1.25, down from 1.5. A converter is capped by its INPUTS; the
        // ore supply already says when to stop, so a punitive curve on top of
        // it was friction doing no work. Compounded at 1.5 the seventh forge
        // cost 513 wood and 342 stone, which is what the era's own pacing had
        // driven the owner toward. At 1.25 the sixth costs 137.
        id: "forge", name: "Forge", kind: "building",
        desc: "Smelts 4 copper + 1 tin into 1 bronze, continuously.",
        base: { wood: 45, stone: 30 }, scale: 1.25, buildTime: 26,
        converts: { in: { copper: 4, tin: 1 }, out: { bronze: 1 }, rate: 0.20 },
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
        id: "farming", name: "Farming", kind: "upgrade",
        desc: "Turn a holding over to worked fields. A farmed hex feeds you better than any bare ground can — and gives up everything else it might have produced.",
        // Priced in wood and stone only, deliberately: upgrades INHERIT, so an
        // era-specific metal in the cost breaks the moment the alloy economy
        // retires at Iron -- which the validator caught the first time this was
        // written with bronze in it. Farming is not about metal anyway.
        base: { wood: 120, stone: 80 }, buildTime: 45,
        reveal: () => S.pop >= 12,
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
        reveal: () => S.pop >= 50 && ((S.units.archer || 0) >= 1 || (S.units.horseman || 0) >= 1),
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
  // Bronze can reach outward, because Bronze hands you gear and it would be
  // incoherent to hand you bronze-tipped spears and hide armour and then
  // forbid you from carrying them anywhere (owner ruling, 2026-08-24). What
  // scales by age is the SIZE of the thing you send: a war party here, a
  // campaign at Iron. Reach is not gated either -- `marchFactor` already makes
  // distance the limit, so a Bronze party can bloody the camp over the hill
  // and could never dream of crossing the continent.
  // BUILDING ON A HEX begins here (design.md, Building on a Hex). A structure
  // takes the hex's ONE use: the resource buttons go away, because there is no
  // parallel town beside the fields.
  // Redeclared WHOLESALE, like every slate: Stone's two survive by being
  // written again, and Bronze adds the alloy economy plus its release valve.
  structures: [
    {
      id: "lumberCamp", name: "Lumber Camp",
      terrain: ["forest"],
      yield: { res: "wood", rate: 1.8 },
      base: { wood: 30, stone: 12 }, scale: 1.35, buildTime: 24,
      desc: "Saw pits, drying stacks and a road out. Nearly doubles what the forest gives.",
    },
    {
      id: "stonePit", name: "Stone Pit",
      terrain: ["hills"],
      yield: { res: "stone", rate: 1.8 },
      base: { wood: 32, stone: 14 }, scale: 1.35, buildTime: 24,
      desc: "Cut a face into the hillside and work it properly. Nearly doubles what the hills give.",
    },
    // THE ALLOY ECONOMY IS A THING YOU BUILD. The hills do not start yielding
    // copper because the age turned -- you sink a mine, and that hills hex
    // stops being a stone hex to do it. Bronze wants copper AND tin AND
    // stone, and every one of them comes out of the same terrain, which is
    // what makes hills the contested ground of this age.
    {
      id: "copperMine", name: "Copper Mine",
      terrain: ["hills"],
      yield: { res: "copper", rate: 1.0 },
      base: { wood: 45, stone: 35 }, scale: 1.35, buildTime: 35,
      desc: "Follow the green stain into the hill. The stone above it stays where it is.",
    },
    {
      // Tin holds at exactly half copper: the scarce half of the alloy, and
      // the reason a Bronze realm is always short of something.
      id: "tinMine", name: "Tin Mine",
      terrain: ["hills"],
      yield: { res: "tin", rate: 0.5 },
      base: { wood: 45, stone: 35 }, scale: 1.35, buildTime: 35,
      desc: "The rarer ore, and the one the smiths always want more of. Half what a copper seam gives, and worth more for it.",
    },
    // THE RELEASE VALVE (2026-08-25). One resource per hex makes the map
    // decisive, and a decisive map can deal you a hand with no tin on it.
    // The Market is the answer that does not require a friendly neighbour:
    // a bank that always says yes, at a bad rate. It arrives at Bronze
    // because Stone runs on food, wood and stone alone -- ground the
    // generator guarantees every seat -- and scarcity only starts to bite
    // when the alloys do.
    {
      id: "market", name: "Market",
      terrain: ["plains", "river"],
      trades: true,
      base: { wood: 80, stone: 50 }, scale: 1.5, buildTime: 45,
      desc: "Scales, a weighing floor, and traders who will take anything off your hands — at their price, never yours. Produces nothing itself.",
    },
    {
      id: "farm", name: "Farm",
      requires: "farming",
      terrain: ["plains", "river"],
      // FLAT, not terrain-scaled, and that is the decision (owner, 2026-08-25):
      // "an increased rate beyond what any bare plains can give you". Plains
      // work food at x1.0 and river at x1.2, so x1.7 beats every ground in the
      // game at feeding people -- and the consequence is deliberate: a farm is
      // worth most where food was WORST, so farming is how poor country starts
      // feeding you. The real cost is the specialty you give up. A forest that
      // becomes a farm stops cutting timber entirely.
      yield: { res: "food", rate: 1.7 },
      // Non-trivial on purpose, or the food economy is solved forever: the
      // upgrade is a real Bronze investment and each field costs again, rising
      // per copy like every other building line.
      base: { wood: 55, stone: 30 }, scale: 1.4, buildTime: 40,
      desc: "Break the ground and work it properly. Feeds far better than bare land — and the hex gives up everything else it could have produced.",
    },
  ],

  contact: "open",

  // WHAT AN AGE SENDS: the building that must stand before anything marches.
  // It carried a column-size cap too until 2026-08-25; that was the wrong
  // lever and is gone (see expeditions.js). Bronze sends less than Iron
  // because it HOLDS less -- levyCap is territory x armyPerHex, and a Bronze
  // dominion caps at 12 hexes against Iron's 20 -- and because provisions are
  // paid per fighter, per tile. Nobody has to decide the number.
  muster: { building: "warCamp" },

  // The neighbours, one age on: peoples now, not camps. Walls appear because
  // masonry does. Still strictly above the Bronze minor band ([2,5]).
  adversaries: [
    {
      id: "hillClans", name: "the Hill People", disposition: "warlike",
      homeTerrain: "hills",
      strength: 7, walls: 2, fightsAs: "massed", campaignTime: 90,
      stock: { food: 70, wood: 50, bronze: 20 },
      desc: "The ridge camps have grown into one people, and they have learned to alloy. Their spears are tipped now, and they come down more often than they used to.",
    },
    {
      id: "riverKingdom", name: "the River Folk", disposition: "peaceful",
      homeTerrain: "river",
      strength: 18, walls: 9, fightsAs: "riders", campaignTime: 120,
      stock: { food: 150, wood: 80, bronze: 40 },
      desc: "Earthworks, granaries, and a stretch of the river dredged straight. There is no coin yet to trade with them for any of it, and there are already far too many of them to take it.",
    },
    {
      id: "saltNomads", name: "the Salt Wanderers", disposition: "peaceful",
      homeTerrain: "plains",
      strength: 9, walls: 0, fightsAs: "riders", campaignTime: 75,
      stock: { food: 60, wood: 30, bronze: 15 },
      desc: "Wagons now, and a circuit they keep to. They have no mines and want none. What they cannot carry they barter for, and they always know what a thing is worth.",
    },
  ],

  events: ["greatHunt", "trader", "sickness", "conflict", "scoutFind", "scoutWarning"],
  hints:  ["wood", "stone", "build", "tools", "rotFood", "rotWood", "rotStone", "oldStores",
           "sicknessWarn", "conflictWarn", "rotOre", "firstBronze", "ironAvailable"],
};

