import { S, me } from "../core/state.js";
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
  // A PERSON-WORD AGAIN (2026-08-25). This said "holdfast" -- the same word as
  // the tile noun below -- which was correct while population WAS tiles and
  // wrong from the moment the engine rework made population a real per-hex
  // variable. The POP tooltip rendered "every holdfast counted here stands on
  // one of your 20 hexes". The compiler now refuses the collision outright.
  popNoun: { singular: "subject", plural: "subjects" },
  // THE ODOMETER TURNS ON HERE. A hex is a holdfast now, and one unit of hex
  // population is a whole community rather than a person -- so a 20-hex realm
  // reads as roughly 60,000 subjects instead of 300 people. That is a plausible
  // iron-age kingdom, and it is the first age where the topline number and the
  // ground truth are allowed to disagree. Play numbers stay small; the noun and
  // the scale get big. One constant -- retune against play.
  soulsPerPerson: 200,
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
  // lives on hexes (so cutting me().pop changed nothing anyone could see).
  // The border is a pure re-denomination now -- exactly where the design was
  // heading anyway.
  // The tile noun changes, so the world recuts at holdfast scale (design.md,
  // Scale: The Tile Ladder) -- bigger country, and the three majors take
  // seats on it. Still a readout in 6a; the rest of phase 6 makes it real.
  map: {
    tileNoun: { singular: "holdfast", plural: "holdfasts" },
    terrains: ["plains", "forest", "hills", "river", "water"],
    seats: SEAT_IDS,
    // Iron-scale carrying caps: 3x Stone. "A mountain starts at 20" (owner)
    // is an Iron-scale instinct -- hills land at 9 here and pass 20 in later
    // eras as the cap curve keeps climbing.
    popCaps: { plains: 24, river: 30, forest: 15, hills: 9 },
    claim: { cost: { food: 40, wood: 25, stone: 12, iron: 5 }, time: 45 },
    dominionCap: 20,
    // Bare ground is bare ground in every age. Iron comes out of a mine.
    yields: {
      plains: { res: "food",  rate: 1.0 },
      river:  { res: "food",  rate: 1.3 },
      forest: { res: "wood",  rate: 1.0 },
      hills:  { res: "stone", rate: 1.0 },
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
    // (its jobs left the game entirely in E2 -- nothing to remove; its Ore
    // Yard, and the whole storage line, predeceased in 4c)
    "bronzeTools", "bronzeWeapons", "scouting",  // stranded: priced in a dead resource
    "warCamp",                            // superseded: a ring of hide tents does not
                                          // stage a legion, and it was priced in bronze
    "flintSpears",                        // superseded twice over
    "ironAge",                            // a capstone exists only in the era it ends
  ],

  override: {
    // CAPS RETURN AT IRON (4c, 2026-08-25). Uncapped Iron "was never a ruling
    // so much as a temporary fix" (owner) -- for granary-spam being a chore
    // and for walking away and returning to 20,000 of everything. Both died
    // with the storage buildings, so the era budget runs here too; it matters
    // doubly once fast-forward ships. Sized generously for an era with no
    // capstone yet -- tunable when Iron gets its exit.
    food:  { baseCap: 800 },
    wood:  { baseCap: 700 },
    stone: { baseCap: 700 },
    // (The Forge override left here 2026-08-25: the Forge is a STRUCTURE now,
    // and Iron redeclares its structure slate wholesale, so the Iron recipe
    // and rate are authored there rather than patched onto a building.)
    // Re-priced out of the dead resource. Iron is cheaper than bronze was --
    // it's everywhere; that's the whole point of the era.
    stables: { base: { wood: 60, stone: 25, iron: 12 } },
    archer: { base: { wood: 14, iron: 8 } },
    horseman: { base: { wood: 20, iron: 16 } },
  },

  add: {
    resources: [
      { id: "iron",  name: "Iron",  baseCap: 400, reveal: () => true },
      // Steel, like bronze before it, is spent rather than stockpiled.
      { id: "steel", name: "Steel", baseCap: 300, reveal: () => true },
      // Gold cannot be mined. It enters only from outside -- and it is NEVER
      // capped, this era or any other: cap what accrues while you are not
      // playing, never what you can only get by acting (the 4c law).
      { id: "gold",  name: "Gold",  baseCap: Infinity, reveal: () => true },
    ],
    // No jobs: the allocation verb lives on the map now. Iron ARRIVES as
    // terrain instead of as a job -- hills can be turned to it.
    jobs: [],
    buildings: [],   // the panel is retired -- see the note in stone.js
    upgrades: [
      // THE UNLOCK GATES (moved off the panel 2026-08-25). Both were cap-1
      // buildings whose only effect was a permanent unlock -- which is a tech.
      {
        // Gates the Expeditions verbs the way the Barracks gates Training.
        // One outbound column at a time; how BIG it is answered by what you
        // hold and can feed, never by a number here.
        id: "musterGround", name: "Muster Ground", kind: "upgrade",
        desc: "A parade ground, a quartermaster, and the habit of counting spears before they leave. Lets your realm send a column.",
        base: { wood: 60, stone: 30, iron: 20 }, buildTime: 35,
        reveal: () => true,
      },
      {
        id: "siegeWorkshop", name: "Siege Workshop", kind: "upgrade",
        desc: "Beams, rope and the arithmetic of leverage. Lets your people build Siege Engines.",
        base: { wood: 50, stone: 40, iron: 15 }, buildTime: 30,
        reveal: () => !!me().upgrades.barracks,
      },
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
        reveal: () => !!me().upgrades.barracks,
      },
      {
        id: "fortification", name: "Fortification", kind: "upgrade",
        desc: "Cut stone, raise walls, and hold a border properly. Lets a holding be turned over entirely to defence.",
        base: { wood: 160, stone: 220, iron: 60 }, buildTime: 60,
        reveal: () => me().pop >= 30,
      },
      {
        id: "steelArmor", name: "Steel Armor", kind: "upgrade",
        desc: "Plate over hide. Improves your fighters' odds of surviving a fight, again.",
        base: { steel: 30, gold: 25 }, buildTime: 30,
        reveal: () => !!me().upgrades.barracks,
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
        reveal: () => !!me().upgrades.siegeWorkshop,
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
  // The march-hold: a hex given over entirely to holding a border. Named from
  // the medieval "march" -- a contested borderland -- where a marcher keep held
  // off incursions before the kingdom's armies could move (owner's pick).
  //
  // It YIELDS NOTHING, which is the point and the price: you are trading a
  // hex's whole output for defence. `fortifies` is what fortStrength() reads.
  // Redeclared wholesale. The copper and tin mines go with the alloys they
  // served; the Iron Mine takes their place on the hills.
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
    {
      id: "ironMine", name: "Iron Mine",
      terrain: ["hills"],
      yield: { res: "iron", rate: 1.0 },
      base: { wood: 70, stone: 60 }, scale: 1.35, buildTime: 45,
      desc: "Deeper than a copper working and hotter at the face. The hill gives iron or it gives stone — never both.",
    },
    {
      id: "market", name: "Market",
      terrain: ["plains", "river"],
      trades: true,
      base: { wood: 110, stone: 70 }, scale: 1.5, buildTime: 45,
      desc: "Scales, a weighing floor, and traders who will take anything off your hands — at their price, never yours. Produces nothing itself.",
    },
    {
      id: "farm", name: "Farm",
      requires: "farming",
      terrain: ["plains", "river"],
      yield: { res: "food", rate: 1.7 },
      base: { wood: 55, stone: 30 }, scale: 1.4, buildTime: 40,
      desc: "Break the ground and work it properly. Feeds far better than bare land — and the hex gives up everything else it could have produced.",
    },
    {
      id: "infirmary", name: "Infirmary",
      heals: true,
      base: { wood: 24, stone: 8 }, scale: 1.5, buildTime: 20,
      desc: "Healers, clean water and somewhere to put the sick. Covers this holdfast and the ones around it — and the ground it stands on stops producing.",
    },
    {
      id: "forge", name: "Forge",
      converts: { in: { iron: 3, wood: 2 }, out: { steel: 1 }, rate: 0.55 },
      base: { wood: 45, stone: 30 }, scale: 1.25, buildTime: 26,
      desc: "Burns wood to work iron into steel — 3 iron + 2 wood into 1 steel, continuously. The ground it stands on stops producing.",
    },
    {
      id: "marchHold", name: "March-hold",
      requires: "fortification",
      fortifies: true,
      base: { wood: 120, stone: 200, iron: 40 }, scale: 1.35, buildTime: 75,
      desc: "Walls, a gate, and people who watch the road. Produces nothing at all — it holds this ground and the ground beside it, and raids that come here break on it instead of on your people.",
    },
  ],

  // AN IRON PEOPLE RIDES. Horsemen stop being a curiosity and become a third
  // of what comes over the hill -- and a player still in Stone has neither the
  // archers for a massed charge nor the riders to run down a mounted raid.
  raidTypes: [
    { id: "warband", name: "warband",         weight: 30 },
    { id: "massed",  name: "massed charge",   weight: 35 },
    { id: "riders",  name: "band of riders",  weight: 35 },
  ],

  contact: "open",
  // The Muster Ground's cap of 1 is the real pacing: one outbound column at a
  // time, whatever its size. How big that column can be is answered by what
  // you hold and what you can feed, not by a number here.
  muster: { upgrade: "musterGround" },

  events: ["greatHunt", "trader", "sickness", "conflict", "scoutFindIron", "scoutWarning"],
  // The rot hints RETURNED in 4c with the caps themselves; oldStores narrates
  // a legacy save's dead storehouses exactly once. directHoldfasts is the
  // one-time pointer at the allocation flip.
  hints:  ["wood", "stone", "build", "tools", "rotFood", "rotWood", "rotStone", "oldStores",
           "sicknessWarn", "conflictWarn", "firstSteel", "firstGold", "neighbors", "develop"],
};

