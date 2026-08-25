import { CONFIG } from "../core/config.js";
import { rng } from "../core/rng.js";
import { caps, totalUnits } from "../core/derived.js";
import { S } from "../core/state.js";
import { CONFLICT_FLAVOR, armorFactor, counterCoverage, militaryStrength, pick, raidGround, removeRandomUnit, reconcileReservations, rollRaidSize, rollRaidType, sentenceCase, stealResources } from "../sim/combat.js";
import { fortStrength, hexPop, killAt, strikeHex, world } from "../map/map.js";
import { hostilityMultiplier, raidAttribution } from "../sim/expeditions.js";
import { log } from "../ui/log.js";

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
// ---------- The roster, shared by every era ----------------------------
// WHO exists is decided at generation and never changes; ERA decides only what
// they are called and how strong they are (owner ruling, 2026-08-24: "enemies
// that survive need to evolve alongside you"). That means these two lists must
// be IDENTICAL in every age, so they are declared once here and imported --
// never retyped per era, where they could silently drift apart.
//
// Placement is a per-hex hash over the name pool, so the pool's LENGTH is
// load-bearing: change it and every steading in every existing world moves.
// The compiler asserts this across eras rather than trusting the comment.
export const SEAT_IDS = ["hillClans", "riverKingdom", "saltNomads"];

// Bare LANDSCAPE names, deliberately free of any settlement noun: there are no
// freeholds in the Stone Age and no towers either, but a cold stretch of water
// and a barrow on a hill are there in every age. The era supplies the noun via
// `minors.form`, which is the whole re-dress trick -- the camp at Coldwater
// becomes the steading at Coldwater becomes the freehold at Coldwater, and it
// is understood to be the same people the entire time.
export const MINOR_PLACES = [
  "Coldwater", "Barrow Hill", "Thornwick", "Greyfen", "Redbank",
  "the Salt Licks", "Larkmoor", "Stonebrook", "the Hollow Oak", "Ravensmoor",
  "Blackfen", "Whitecrag", "Elderbrook", "Oxbend",
];

export const EVENT_LIB = {
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
    // SCALES WITH POPULATION (2026-08-25), the same way conflict always has: a
    // hazard with a flat rate is one you outgrow, and three infirmaries used to
    // retire it permanently. See design.md, The Economy Must Be Able To Break You.
    popScaled: true,
    sev: "bad",
    condition: (S) => S.pop >= 4,
    chancePerSecond: 0.0015,                        // ~11 real minutes average, unmitigated
    counter: { building: "infirmary", reducePerUnit: (S) => S.upgrades.herbalMedicine ? 0.35 : 0.2 },
    // E5: the fever breaks out SOMEWHERE -- a hex chosen person-weighted, so
    // your dense river valley hosts more outbreaks than a hill camp. It takes
    // a fifth of the hex (min one), which is what makes sickness matter at a
    // hundred souls without mattering MORE than a hundred souls can absorb.
    effect: (S) => {
      const at = strikeHex("sickness");
      if (!at) return;
      const toll = Math.max(1, Math.floor(hexPop(at) * 0.2));
      const died = killAt(at, toll);
      reconcileReservations();
      if (!died) return;
      return died === 1
        ? `A fever sweeps the ${world.places[at].terrain}. One of your people does not recover.`
        : `A fever sweeps the ${world.places[at].terrain} — ${died} of your people do not recover.`;
    },
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
      if (rng() >= p) return;

      const raidSize = rollRaidSize();
      const raid = rollRaidType();

      // ---- SELECTION: that it happens, who sends it, and WHERE IT LANDS ----
      // The hex is chosen here, before anything is resolved. It used to be
      // picked last, inside the failure branch, which made the place a
      // consequence of the outcome; a raid arrives somewhere and THEN is
      // fought. Nothing the player builds may touch this phase (design.md:
      // selection and resolution are separate).
      const at = strikeHex("raid");

      // ---- RESOLUTION: what it costs, and this is where walls act ----
      // Defence is the army (global -- units are not stationed, and unit
      // micromanagement is out of scope) PLUS the walls covering the hex that
      // was actually struck. Flat addition, so a march-hold defends a player
      // with no soldiers at all.
      const defense = militaryStrength(raid) + (at ? fortStrength(at) : 0);
      const repelChance = defense / (defense + raidSize);
      // WHOSE raid this is (C3). Null at Stone by era-fact, which selects the
      // anonymous pool -- the danger is identical, only the attribution
      // changes. Drawn once here so both the flavor line and the hex strike
      // below blame the same people.
      const raiders = raidAttribution();
      const say = (anon, named, sev) => {
        const line = raiders
          ? pick(named).replace(/\{who\}/g, raiders.name).replace("{ground}", raidGround(raiders))
          : pick(anon);
        log(sentenceCase(line.replace("{raid}", raid.name)), sev);
      };

      if (rng() < repelChance) {
        // Second dial: fielding the countering unit type doesn't just help you
        // win, it means fewer of your own die when you do.
        const relief = 1 - CONFIG.counterCasualtyRelief * counterCoverage(raid);
        const costlyChance = (raidSize / (defense + raidSize)) * armorFactor() * relief;
        if (rng() < costlyChance) {
          const lost = removeRandomUnit();
          log(`The ${raid.name} is driven off, but not without cost — a ${lost || "defender"} falls in the fighting.`, "bad");
        } else {
          say(CONFLICT_FLAVOR.repelledClean, CONFLICT_FLAVOR.repelledCleanNamed, "good");
        }
      } else {
        const losses = Math.min(totalUnits(), 1 + Math.floor(raidSize / 5));
        for (let i = 0; i < losses; i++) removeRandomUnit();
        stealResources(raidSize);
        say(CONFLICT_FLAVOR.raidSucceeds, CONFLICT_FLAVOR.raidSucceedsNamed, "bad");
        if (defense === 0 || defense < raidSize / 2) {
          // Only a thin defence lets them reach the people. The hex was chosen
          // during selection; this is simply whether they got that far.
          if (at) {
            // A SHARE of the hex, floored at one so a raid always costs
            // somebody. Scale-invariant by construction: a big realm loses
            // proportionally as much as a small one, which is what stops the
            // danger decaying into a rounding error as the map fills.
            const here = hexPop(at);
            // Capped, so no single blow empties a hex outright -- losing ground
            // should take a campaign of raids, or a raid on a hex already thin,
            // rather than one unlucky roll.
            const share = Math.min(CONFIG.raidTollMax, CONFIG.raidTollShare * raidSize);
            const toll = Math.max(1, Math.round(here * share));
            const died = killAt(at, toll);
            reconcileReservations();
            if (died) {
              // The same attribution, on the line that names a PLACE. An
              // anonymous raid burns "the hills"; a named one is your
              // neighbours doing it, which is a different sentence entirely.
              const toll = died === 1 ? "a soul is" : died + " souls are";
              const who = raiders ? sentenceCase(raiders.name) : "Raiders";
              log(`${who} put the ${world.places[at].terrain} to the torch — ${toll} lost.`, "bad");
            }
          }
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
export const HINT_LIB = {
  wood:  { when: () => S.res.wood  > 0, msg: "You have wood enough to notice its worth." },
  stone: { when: () => S.res.stone > 0, msg: "Stone piles up beside the wood." },
  build: { when: () => S.res.wood >= 8, msg: "There is timber enough to build. Raise a hut for your people." },
  tools: { when: () => S.map && S.map.owned.length >= 4, msg: "With new ground claimed, your people turn to better tools." },
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
  directHoldfasts: { when: (S_) => Object.keys((S.map && S.map.work) || {}).length === 0,
    msg: "Your holdfasts await direction — open the Map and set each to work its ground." },
  firstSteel: { when: () => S.res.steel > 0,
    msg: "The Forge runs hotter than it ever did for bronze. The first steel is yours." },
  firstGold: { when: () => S.res.gold > 0,
    msg: "Gold. No one in your town has ever dug up an ounce of it — it only ever arrives from somewhere else." },
  neighbors: { when: () => S.builds.forge >= 1 || S.res.iron >= 20,
    msg: "Travellers name your neighbors now: the Hill Clans in the high passes, the River Kingdom downstream, the Salt Nomads on the flats. A Muster Ground would let your people range out to meet them — one way or another." },
};

