import { S } from "../core/state.js";

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
    seats: [],
    popCaps: { plains: 12, river: 15, forest: 8, hills: 5 },
    // The claim carries the age's SIGNATURE resource (owner ruling,
      // 2026-08-24) -- the capstone pricing rule, applied to the frontier:
      // a bronze-age party leaves with bronze fittings. Small next to the
      // base three, but it means no era's economy can be skipped while the
      // dominion keeps growing on food and timber alone.
      claim: { cost: { food: 30, wood: 15, stone: 8, bronze: 3 }, time: 35 },
      dominionCap: 12,
    works: {
      plains: { food: 1.0, wood: 0.4, stone: 0.3, copper: 0.2, tin: 0.1 },
      river:  { food: 1.2, wood: 0.3, stone: 0.2 },
      forest: { wood: 1.0, food: 0.5, stone: 0.2 },
      hills:  { stone: 1.0, food: 0.3, wood: 0.3, copper: 0.8, tin: 0.4 },
    },
  },

  remove: ["bronzeAge"],

  override: {
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
  events: ["greatHunt", "trader", "sickness", "conflict", "scoutFind", "scoutWarning"],
  hints:  ["wood", "stone", "build", "tools", "rotFood", "rotWood", "rotStone",
           "sicknessWarn", "conflictWarn", "rotOre", "firstBronze", "ironAvailable"],
};

