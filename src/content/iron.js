import { S } from "../core/state.js";

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

