import { S } from "../core/state.js";
import { MINOR_PLACES, SEAT_IDS } from "./lib.js";

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
export const IRON_DELTA = {
  name: "Iron Age",
  // "Underway": once the world opens, the queue panel tracks more than
  // builds -- marching columns and caravans render there too (see renderQueue).
  panelTitles: { "panel-holdings": "Town", "panel-queue": "Underway" },
  popNoun: { singular: "holdfast", plural: "holdfasts" },
  // Conquest Growth (design.md, settled): no one arrives unbidden from here
  // on. Growth is an ACTIVE verb -- campaigns and, in time, envoys.
  // Units are levied, not consumed: army capacity = holdfasts x levy. The
  // holdfasts that raise the war bands stay in the fields.
  // `allocation: "tiles"` and `outputMult: 4` both lived here until E2
  // (2026-08-23). Allocation is universal now, and outputMult existed to make
  // tile-count impersonate population -- population is real, so it retired.
  arrivalLine: "A holdfast swears fealty to your banner.",
  // `consolidate` died here in E2, ahead of its E5 schedule, because the
  // harness caught it colliding with two newer laws at once: dominion never
  // shrinks (so the lockstep instantly undid the pop cut), and population
  // lives on hexes (so cutting S.pop changed nothing anyone could see).
  // The border is a pure re-denomination now -- exactly where the design was
  // heading anyway.
  // The tile noun changes, so the world recuts at holdfast scale (design.md,
  // Scale: The Tile Ladder) -- bigger country, and the three majors take
  // seats on it. Still a readout in 6a; the rest of phase 6 makes it real.
  map: {
    tileNoun: { singular: "holdfast", plural: "holdfasts" },
    terrains: ["plains", "forest", "hills", "river", "water"],
    seats: SEAT_IDS,
    // What a holdfast on each ground yields, per resource (user ruling,
    // 2026-08-22): every land works EVERYTHING, at rates the terrain sets.
    // Specialties run at par or better; the rest are overpay routes -- the
    // board-game trade-off of taking the suboptimal path on purpose. Hills
    // keep their double specialty; river bottomland out-farms the plains
    // (its flavor already said so). Water works nothing. First-guess
    // numbers, tuned toward too-hard as always.
    // Iron-scale carrying caps: 3x Stone. "A mountain starts at 20" (owner)
    // is an Iron-scale instinct -- hills land at 9 here and pass 20 in later
    // eras as the cap curve keeps climbing.
    popCaps: { plains: 24, river: 30, forest: 15, hills: 9 },
    claim: { cost: { food: 40, wood: 25, stone: 12, iron: 5 }, time: 45 },
    dominionCap: 20,
    works: {
      plains: { food: 1.0, wood: 0.4, stone: 0.3, iron: 0.2 },
      river:  { food: 1.2, wood: 0.3, stone: 0.2, iron: 0.2 },
      forest: { wood: 1.0, food: 0.5, stone: 0.2, iron: 0.2 },
      hills:  { stone: 1.0, iron: 1.0, food: 0.3, wood: 0.3 },
    },
    // The minor tier (design.md, Conquest Growth): numerous, individually
    // weak, each worth one sworn holdfast plus a modest stock. Hand-authored
    // NAMES, procedural placement and stats-in-range -- the pool outnumbers
    // the seats so runs differ ("you won't believe what spawned in mine").
    // The Chronicle names the place for the last time when it swears.
    minors: {
      // DENSITY, not a count (owner ruling, 2026-08-24): every eligible hex
      // rolls for a steading, so neighbours scale with the world instead of
      // being a fixed five however big the country is. The roll is a per-hex
      // HASH rather than a stream draw, so adding a generation stage later
      // cannot shift who exists.
      density: 0.06,
      // Narrowed from [3,9] (owner ruling, 2026-08-24): a top-roll minor used
      // to TIE the weakest major at 9, which made the tier words describe
      // nothing. Majors are now strictly stronger inside any given age.
      strength: [3, 7],
      walls: [0, 4],
      stock: { food: [20, 60], wood: [10, 40], iron: [5, 25], gold: [3, 12] },
      // The shared pool, wearing this age's noun. The old list mixed bare
      // place names with settlement nouns baked in ("the Broken Tower"), which
      // could not be redressed backwards -- there are no towers in the Stone
      // Age, and the same fourteen places have to exist in every one.
      names: MINOR_PLACES,
      form: "the freehold at %s",
    },
  },

  remove: [
    "copper", "tin", "bronze",            // the alloy economy, wholesale
    // (its jobs left the game entirely in E2 -- nothing to remove)
    "oreYard",                            // its storage
    "bronzeTools", "bronzeWeapons", "scouting",  // stranded: priced in a dead resource
    "flintSpears",                        // superseded twice over
    "ironAge",                            // a capstone exists only in the era it ends
    "granary", "woodshed", "stoneYard",   // storage caps retire at Iron (user ruling, in the
                                          // scheduled window): a king does not count sacks --
                                          // that is delegated. The friction hands off to the
                                          // conquest economy itself
  ],

  override: {
    // Caps retire at Iron: every resource runs uncapped from here on. The
    // ledger demotes capped rows to bare values, same as the POP row did.
    food:  { baseCap: Infinity, capBuilding: null },
    wood:  { baseCap: Infinity, capBuilding: null },
    stone: { baseCap: Infinity, capBuilding: null },
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
      { id: "iron",  name: "Iron",  baseCap: Infinity, capBuilding: null, reveal: () => true },
      // Steel, like bronze before it, is spent rather than stockpiled.
      { id: "steel", name: "Steel", baseCap: Infinity, capBuilding: null,  reveal: () => true },
      // Gold cannot be mined. It enters only from outside.
      { id: "gold",  name: "Gold",  baseCap: Infinity, capBuilding: null,  reveal: () => true },
    ],
    // No jobs: the allocation verb lives on the map now. Iron ARRIVES as
    // terrain instead of as a job -- hills can be turned to it.
    jobs: [],
    buildings: [
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
    { bucket: "builds", id: "hut", vanish: true,
      narrate: "The stone houses empty as your people gather behind holdfast walls. No one will count roofs again." },
    { bucket: "builds", id: "granary", vanish: true,
      narrate: "The crown stops counting sacks — granaries, sheds and yards are the holdfasts' own business now." },
    { bucket: "builds", id: "woodshed", vanish: true },
    { bucket: "builds", id: "stoneYard", vanish: true },
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
      // Each adversary names its own ground, because each one's DESCRIPTION
      // already did: "the high passes", "downriver ... on the bluffs", "they
      // circle their wagons". Placement was terrain-blind until 2026-08-24,
      // which could seat the Hill Clans in a forest -- a contradiction in a
      // game where descriptions are mechanics-bearing text. A preference, not
      // a demand: a world with no free hills seats them wherever it can.
      homeTerrain: "hills",
      strength: 9, walls: 5, fightsAs: "massed", campaignTime: 90,
      stock: { food: 120, wood: 90, iron: 60, gold: 15 },
      desc: "Raiders in the high passes — weak alone, bold when your walls look thin. Their seat crouches behind a rough timber palisade.",
    },
    {
      id: "riverKingdom", name: "the River Kingdom", disposition: "peaceful",
      homeTerrain: "river",
      strength: 32, walls: 26, fightsAs: "riders", campaignTime: 120, caravanTime: 75,
      stock: { food: 250, steel: 25, gold: 240 },
      buys: { res: "food", amount: 60, pays: 15 },
      desc: "A state downriver, rich beyond counting and always hungry — they pay gold for food. Its heart is a stone-walled castle on the bluffs.",
    },
    {
      id: "saltNomads", name: "the Salt Nomads", disposition: "peaceful",
      homeTerrain: "plains",
      strength: 13, walls: 2, fightsAs: "riders", campaignTime: 75, caravanTime: 60,
      stock: { food: 90, iron: 30, gold: 80 },
      buys: { res: "iron", amount: 40, pays: 12 },
      desc: "Wandering herders with no mines of their own — they pay gold for iron. At night they circle their wagons into a laager; they build no walls.",
    },
  ],

  // Full war, in both directions: campaigns, sieges, conquest.
  contact: "open",

  events: ["greatHunt", "trader", "sickness", "conflict", "scoutFindIron", "scoutWarning"],
  // No rot hints: caps retired with the storage line. directHoldfasts is the
  // one-time pointer at the allocation flip.
  hints:  ["wood", "stone", "build", "tools",
           "sicknessWarn", "conflictWarn", "firstSteel", "firstGold", "neighbors", "directHoldfasts"],
};

