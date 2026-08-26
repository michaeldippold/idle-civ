import { S, me } from "../core/state.js";
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
    herbalMedicine: { desc: "Increases how much each Infirmary reduces the chance sickness claims a life." },
  },

  add: {
    resources: [
      // Present-in-era resources reveal immediately (`() => true`): the
      // manifest is the gate now, where an me().era check used to be.
      // The ores buffer a converter rather than fund a budget -- small caps,
      // no storage (the Ore Yard died with the rest of the line in 4c).
      { id: "copper", name: "Copper", baseCap: 50,  reveal: () => true },
      { id: "tin",    name: "Tin",    baseCap: 50,  reveal: () => true },
      // Bronze is spent on upgrades rather than stockpiled, so it gets a
      // generous ceiling.
      { id: "bronze", name: "Bronze", baseCap: 200, reveal: () => true },
    ],
    buildings: [],   // the panel is retired -- see the note in stone.js
    upgrades: [
      // THE UNLOCK GATES (moved off the panel 2026-08-25). Cap-1 buildings
      // whose only effect was "you may now train X" -- which is a tech.
      {
        // Bronze's answer to the Muster Ground, and deliberately smaller in
        // every dimension: cheaper, quicker, and it sends four people rather
        // than an army. Without it `contact: "open"` was a lie -- the March
        // button appeared at Bronze and sat permanently disabled behind
        // something that does not exist until Iron.
        id: "warCamp", name: "War Camp", kind: "upgrade",
        desc: "A ring of hide tents and a fire kept lit. Enough to send a few spears over the hill and expect most of them back.",
        base: { wood: 35, stone: 15, bronze: 8 }, buildTime: 24,
        reveal: () => !!me().upgrades.barracks,
      },
      {
        id: "archeryRange", name: "Archery Range", kind: "upgrade",
        desc: "Butts, bowyers, and the patience to use them. Lets your people train as Archers.",
        base: { wood: 50, stone: 20 }, buildTime: 28,
        reveal: () => !!me().upgrades.barracks,
      },
      {
        id: "stables", name: "Stables", kind: "upgrade",
        desc: "Horses broken to the saddle. Lets your people train as Horsemen, and makes scouting possible.",
        base: { wood: 60, stone: 25, bronze: 10 }, buildTime: 34,
        reveal: () => !!me().upgrades.barracks,
      },
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
        reveal: () => !!me().upgrades.barracks,
      },
      {
        id: "farming", name: "Farming", kind: "upgrade",
        desc: "Turn a holding over to worked fields. A farmed hex feeds you better than any bare ground can — and gives up everything else it might have produced.",
        // Priced in wood and stone only, deliberately: upgrades INHERIT, so an
        // era-specific metal in the cost breaks the moment the alloy economy
        // retires at Iron -- which the validator caught the first time this was
        // written with bronze in it. Farming is not about metal anyway.
        base: { wood: 120, stone: 80 }, buildTime: 45,
        reveal: () => me().pop >= 12,
      },
      {
        id: "scouting", name: "Scouting", kind: "upgrade",
        desc: "Riders range beyond the valley and bring back word of what's out there.",
        base: { food: 40, bronze: 15 }, buildTime: 25,
        reveal: () => !!me().upgrades.stables,
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
        reveal: () => me().pop >= 50 && ((me().units.archer || 0) >= 1 || (me().units.horseman || 0) >= 1),
      },
    ],
    units: [
      {
        id: "archer", name: "Archer", kind: "unit", popCost: 1,
        strength: 1.0, counters: "massed", casualtyWeight: 0.35,
        // WORSE IN THE OPEN THAN A SOLDIER, and the only thing that fires from
        // inside a fortification. One rule does two jobs: the same penalty that
        // keeps archers out of field armies is what stops an all-archer garrison
        // being strictly correct, because a breach is fought in the open.
        dice: 1, hit: 8, role: "ranged",
        desc: "Deadly against a massed charge, and safer than most — they fight from behind the line.",
        base: { wood: 14, bronze: 6 }, buildTime: 18,
        reveal: () => !!me().upgrades.archeryRange,
      },
      {
        id: "horseman", name: "Horseman", kind: "unit", popCost: 1,
        strength: 1.5, counters: "riders", casualtyWeight: 0.6,
        // The strong melee, and behind a wall it does nothing at all: cavalry
        // cannot engage cavalry from inside a castle. It waits for the breach.
        dice: 1, hit: 5, role: "melee",
        desc: "Strong in any fight, quick enough to run down mounted raiders, and quick enough to withdraw.",
        base: { wood: 20, bronze: 14 }, buildTime: 24,
        reveal: () => !!me().upgrades.stables,
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
      // THE FORGE STANDS SOMEWHERE NOW (2026-08-25). It transforms rather than
      // produces, and as a panel building it stacked freely and could never be
      // pulled down -- so an age that changed its recipe left you with six of
      // them converting ore you wanted to spend, with no way out. On a hex it
      // costs ground, it can be demolished, and a rival can burn it.
      //
      // RATE 0.25, which is deliberately "one forge eats one mine": a Copper
      // Mine at a full Bronze hills hex yields 1.0 copper/s, and a forge at
      // 0.25 draws 4 x 0.25 = 1.0. So ONE is the answer for one mine and two
      // is the answer for two, which is what the owner asked for -- and the
      // hex price makes over-building self-punishing rather than merely
      // pointless. (It ran at 0.20 as a panel building, where the answer was
      // "about three".) A tin mine yields 0.5/s and a forge draws 0.25, so tin
      // is the half that lets you run two forges off one seam.
      id: "forge", name: "Forge",
      converts: { in: { copper: 4, tin: 1 }, out: { bronze: 1 }, rate: 0.25 },
      base: { wood: 45, stone: 30 }, scale: 1.25, buildTime: 26,
      desc: "Smelts 4 copper and 1 tin into 1 bronze, continuously. The ground it stands on stops producing — a smelter is not a field.",
    },
    {
      id: "market", name: "Market",
      terrain: ["plains", "river"],
      trades: true,
      base: { wood: 80, stone: 50 }, scale: 1.5, buildTime: 45,
      desc: "Scales, a weighing floor, and traders who will take anything off your hands — at their price, never yours. Produces nothing itself.",
    },
    {
      // "Infirmary" is this structure's Bronze name; the id never changes.
      id: "infirmary", name: "Infirmary",
      heals: true,
      base: { wood: 24, stone: 8 }, scale: 1.5, buildTime: 20,
      desc: "Healers, clean water and somewhere to put the sick. Covers this clearing and the ones around it — and the ground it stands on stops producing.",
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

  // A BRONZE PEOPLE FIGHTS DIFFERENTLY. Massed charges are the age's shape --
  // alloyed spearheads and enough of them to press a line -- and the first
  // horsemen appear. Against a Stone player neither has an answer.
  raidTypes: [
    { id: "warband", name: "warband",         weight: 48 },
    { id: "massed",  name: "massed charge",   weight: 37 },
    { id: "riders",  name: "band of riders",  weight: 15 },
  ],

  contact: "open",

  // WHAT AN AGE SENDS: the building that must stand before anything marches.
  // It carried a column-size cap too until 2026-08-25; that was the wrong
  // lever and is gone (see expeditions.js). Bronze sends less than Iron
  // because it HOLDS less -- levyCap is territory x armyPerHex, and a Bronze
  // dominion caps at 12 hexes against Iron's 20 -- and because provisions are
  // paid per fighter, per tile. Nobody has to decide the number.
  muster: { upgrade: "warCamp" },

  // The neighbours, one age on: peoples now, not camps. Walls appear because
  // masonry does. Still strictly above the Bronze minor band ([2,5]).
  adversaries: [
    {
      id: "hillClans", name: "the Hill People", disposition: "warlike", color: "brown",
      homeTerrain: "hills",
      strength: 7, walls: 2, fightsAs: "massed", campaignTime: 90,
      stock: { food: 70, wood: 50, bronze: 20 },
      desc: "The ridge camps have grown into one people, and they have learned to alloy. Their spears are tipped now, and they come down more often than they used to.",
    },
    {
      id: "riverKingdom", name: "the River Folk", disposition: "peaceful", color: "blue",
      homeTerrain: "river",
      strength: 18, walls: 9, fightsAs: "riders", campaignTime: 120,
      stock: { food: 150, wood: 80, bronze: 40 },
      desc: "Earthworks, granaries, and a stretch of the river dredged straight. There is no coin yet to trade with them for any of it, and there are already far too many of them to take it.",
    },
    {
      id: "saltNomads", name: "the Salt Wanderers", disposition: "peaceful", color: "teal",
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

