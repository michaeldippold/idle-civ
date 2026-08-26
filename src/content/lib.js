import { CONFIG } from "../core/config.js";
import { rng } from "../core/rng.js";
import { caps, totalUnits } from "../core/derived.js";
import { S, me } from "../core/state.js";
import { CONFLICT_FLAVOR, armorFactor, counterCoverage, militaryStrength, pick, raidGround, removeRandomUnit, reconcileReservations, rollRaidSize, rollRaidType, sentenceCase, stealResources } from "../sim/combat.js";
import { builtCount, fortStrength, healersNear, hexPop, holdCount, killAt, strikeHex, world } from "../map/map.js";
import { hostilityMultiplier, raidAttribution, raidSender } from "../sim/expeditions.js";
import { chronicle } from "../core/bus.js";

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
    effect: (S) => { me().res.food += Math.round(8 + me().pop * 1.2); },
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
      const bonus = Math.round(12 + me().pop * 1.5);
      me().res.wood += bonus; me().res.stone += bonus;
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
    condition: (S) => me().pop >= 4,
    // OWNS ITS OWN TRIGGER, like conflict, and for the same reason: the
    // mitigation is POSITIONAL now, so the hex has to be chosen BEFORE anyone
    // asks whether healers cover it. The generic chancePerSecond path rolls
    // negation first and picks a hex second, which cannot answer "is there an
    // infirmary near THIS outbreak?"
    //
    // Selection and resolution stay separate (design.md): where the fever
    // breaks out is decided by the world and nothing the player builds may
    // touch it. What healers change is only what happens next.
    resolve: (S, dt) => {
      // SCALES WITH POPULATION, the same way conflict always has: a hazard
      // with a flat rate is one you outgrow, and three infirmaries used to
      // retire it permanently.
      const chance = 0.0015 * (1 + me().pop * CONFIG.sicknessPopScale);
      const p = 1 - Math.pow(1 - chance, dt);
      if (rng() >= p) return;

      // ---- SELECTION: that it happens, and WHERE ----
      const at = strikeHex("sickness");
      if (!at) return;

      // ---- RESOLUTION: and this is where healers act ----
      const healers = healersNear(at);
      const per = me().upgrades.herbalMedicine ? 0.35 : 0.2;
      const negate = Math.min(1 - CONFIG.counterFloor, healers * per);
      if (rng() < negate) {
        chronicle(healers > 0
          ? pick([
              "Sickness threatens the settlement, but healers are close enough to keep it at bay.",
              "A fever passes through -- your healers see everyone through it.",
            ])
          : "A fever passes through, and it passes.", "good");
        return;
      }

      const toll = Math.max(1, Math.floor(hexPop(at) * 0.2));
      const died = killAt(at, toll);
      reconcileReservations();
      if (!died) return;
      const where = world.places[at].terrain;
      // The line says whether help was NEAR, because that is the decision the
      // player is being taught: a corner of the realm left uncovered is a
      // choice with a consequence, and the Chronicle should name it.
      const far = healers === 0 ? " No healers were near enough to help." : "";
      chronicle(died === 1
        ? `A fever sweeps the ${where}. One of your people does not recover.${far}`
        : `A fever sweeps the ${where} — ${died} of your people do not recover.${far}`, "bad");
    },
  },
  conflict: {
    sev: "bad",
    condition: (S) => me().pop >= 4,
    resolve: (S, dt) => {
      // hostilityMultiplier: every Hostile warlike neighbor raids you more.
      const chance = CONFIG.conflictBaseChance * (1 + me().pop * CONFIG.conflictPopScale) * hostilityMultiplier();
      const p = 1 - Math.pow(1 - chance, dt);
      if (rng() >= p) return;

      // ---- SELECTION: that it happens, WHO SENDS IT, and where it lands ----
      // ATTRIBUTION MOVED FIRST (2026-08-26, the era clock's wire). It used to
      // be drawn after the raid was already rolled and resolved, which was
      // honest about what it was: decoration. The sender appeared nowhere in
      // the arithmetic, so a neighbour advancing an age changed nothing but a
      // line of prose. Now the raid is SHAPED by who sent it -- their roster,
      // their age, their advantage over yours.
      // WHO SENT IT shapes the raid; whether you can NAME them is a separate
      // question the age answers. At Stone you see a war party out of the dark
      // -- and if they are an age ahead, it is a war party you cannot answer.
      const sender = raidSender();
      const raidSize = rollRaidSize(sender);
      const raid = rollRaidType(sender);
      const raiders = raidAttribution();

      // ---- Where it lands ----
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
      // (both drawn during selection above, so the flavour line, the hex strike
      // and the arithmetic all concern the same people.)
      const say = (anon, named, sev) => {
        const line = raiders
          ? pick(named).replace(/\{who\}/g, raiders.name).replace("{ground}", raidGround(raiders))
          : pick(anon);
        chronicle(sentenceCase(line.replace("{raid}", raid.name)), sev);
      };

      if (rng() < repelChance) {
        // Second dial: fielding the countering unit type doesn't just help you
        // win, it means fewer of your own die when you do.
        const relief = 1 - CONFIG.counterCasualtyRelief * counterCoverage(raid);
        const costlyChance = (raidSize / (defense + raidSize)) * armorFactor() * relief;
        if (rng() < costlyChance) {
          const lost = removeRandomUnit();
          chronicle(`The ${raid.name} is driven off, but not without cost — a ${lost || "defender"} falls in the fighting.`, "bad");
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
              chronicle(`${who} put the ${world.places[at].terrain} to the torch — ${toll} lost.`, "bad");
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
    condition: (S) => !!me().upgrades.scouting,
    chancePerSecond: 0.0016,
    effect: (S) => {
      const haul = Math.round(15 + me().pop * 2);
      me().res.wood += haul; me().res.stone += haul;
      me().res.copper += Math.round(haul * 0.4);
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
    condition: (S) => !!me().upgrades.scouting && me().pop >= 4,
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
    condition: (S) => !!me().upgrades.scouting,
    chancePerSecond: 0.0016,
    effect: (S) => {
      const haul = Math.round(15 + me().pop * 2);
      me().res.wood += haul; me().res.stone += haul;
      me().res.iron += Math.round(haul * 0.4);
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
// `hints` slate -- slate membership replaced the me().era checks that used to
// hide inside individual `when()` conditions.
export const HINT_LIB = {
  wood:  { when: () => me().res.wood  > 0, msg: "You have wood enough to notice its worth." },
  stone: { when: () => me().res.stone > 0, msg: "Stone piles up beside the wood." },
  build: { when: () => me().res.wood >= 8, msg: "There is timber enough to build. Put it to work on the land you hold." },
  tools: { when: () => S.map && holdCount() >= 4, msg: "With new ground claimed, your people turn to better tools." },
  // Legacy saves hold storage-building counts from before 4c. The counts are
  // INERT (state is never implicitly destroyed) -- this line narrates the
  // change exactly once for anyone who built them.
  oldStores: {
    when: () => ((me().builds.granary || 0) + (me().builds.woodshed || 0) +
                 (me().builds.stoneYard || 0) + (me().builds.oreYard || 0)) > 0,
    msg: "The old storehouses fall quiet -- a realm keeps what its age can hold now, no more and no less.",
  },
  rotFood: { when: () => me().res.food >= caps().food - 0.01,
    msg: "Your food stores are full — the surplus spoils in the open. This age can hold no more: spend it, or outgrow the age." },
  rotWood: { when: () => me().res.wood >= caps().wood - 0.01,
    msg: "Your woodpile is full — extra timber rots in the rain. This age can hold no more: spend it, or outgrow the age." },
  rotStone: { when: () => me().res.stone >= caps().stone - 0.01,
    msg: "Loose stone is piling up faster than anyone can stack it — the excess is lost. This age can hold no more: spend it, or outgrow the age." },
  sicknessWarn: { when: () => me().pop >= 4,
    msg: "More mouths, more risk — crowded camps invite sickness. An infirmary would ease their fears." },
  conflictWarn: { when: () => me().pop >= 4,
    msg: "Word of raiders reaches the settlement. A Barracks would let your people take up arms." },
  rotOre: { when: () => me().res.copper >= caps().copper - 0.01 || me().res.tin >= caps().tin - 0.01,
    msg: "Ore is heaped up beyond what anyone can sort — the excess is lost. This age can hold no more: spend it, or outgrow the age." },
  firstBronze: { when: () => me().res.bronze > 0,
    msg: "The first ingots cool in the mould. Bronze is yours to work with." },
  bronzeAvailable: { when: () => me().pop >= 10 && (me().units.soldier || 0) >= 1,
    msg: "Travellers speak of a harder metal, poured rather than chipped. Your people could reach it — with enough stores behind them." },
  ironAvailable: { when: () => me().pop >= 16 && ((me().units.archer || 0) >= 1 || (me().units.horseman || 0) >= 1),
    msg: "The smiths grumble that tin grows dearer every season. There is a duller, stubborner metal in your own hills — if your people learn to work it." },
  rotIron: { when: () => me().res.iron >= caps().iron - 0.01,
    msg: "Raw iron blooms are heaped up rusting in the open — the excess is lost. This age can hold no more: spend it, or outgrow the age." },
  // (directHoldfasts died 2026-08-25 with the allocation verb: ground works
  // itself now, so no holding has ever "awaited direction".)
  develop: { when: () => S.map && holdCount() >= 4,
    msg: "Your holdings work their own ground. What you BUILD on them is how they do better — open the Map and look at what each hex could become." },
  firstSteel: { when: () => me().res.steel > 0,
    msg: "The Forge runs hotter than it ever did for bronze. The first steel is yours." },
  firstGold: { when: () => me().res.gold > 0,
    msg: "Gold. No one in your town has ever dug up an ounce of it — it only ever arrives from somewhere else." },
  neighbors: { when: () => builtCount("forge") >= 1 || me().res.iron >= 20,
    msg: "Travellers name your neighbors now: the Hill Clans in the high passes, the River Kingdom downstream, the Salt Nomads on the flats. A Muster Ground would let your people range out to meet them — one way or another." },
};

