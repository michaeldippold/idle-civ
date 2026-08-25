/* ============================================================
   Idle Civ — prototype game logic (v6 save schema)
   Deliberately small. Tune the CONFIG block to change the feel.
   Content is authored as per-era manifests (STONE + deltas) compiled at
   load; the engine reads everything through active(). See tech.md.
   ============================================================ */

"use strict";

// ---------- Tunable config ----------------------------------
export const CONFIG = {
  tickMs: 200,            // simulation step
  baseRate: 0.20,         // resources/sec per assigned worker (before bonuses)
  buildingBonus: 0.12,    // additive production bonus per boost-building
  upkeep: 0.04,           // food/sec eaten by EACH settler (idle or working)
  startPop: 3,
  startFood: 12,          // small buffer so you have time to assign a forager
  // (baseHousing and settlerIntervalSeconds died here in E3, with housing and
  // the free-settler timer. Growth is local to hexes and paid for by claiming;
  // popGrowthRate below is the successor to both.)
  // RAISING A PERSON COSTS FOOD (2026-08-25), and this is the sink the economy
  // was missing. Growth used to be FREE: a raided hex refilled itself in
  // minutes at no cost, so nothing could hurt the settlement faster than it
  // healed -- 72 raids in a simulated hour moved the population by 25. And with
  // no consumer, surplus food had nowhere to go but a pile.
  //
  // Food's natural sink is growth. This is Civ's actual model -- food is not a
  // hoard, it spends itself into people -- and it closes the loop the whole
  // economy was missing: surplus becomes population, population becomes upkeep.
  // A settlement that cannot feed itself cannot grow, and one that has been
  // raided pays to recover.
  growthFoodCost: 8,
  // ...and that cost RISES WITH THE REALM. A flat price is trivial late and
  // crushing early: at +6 food/s a flat 12 funds 1,800 births an hour when only
  // 250 are needed to shrug off every raid, while the same 12 is unpayable to a
  // village that starts with 12 food in the larder.
  //
  // Raising a person in a realm of four hundred costs more than in a hamlet of
  // five -- the same wide-play tax the rest of this economy runs on, applied to
  // the one thing that was still free. This is what makes recovery from a raid
  // an EXPENSE rather than a formality.
  growthCostPopScale: 60,
  popGrowthRate: 0.015,   // r in the logistic dP/dt = r*P*(1 - P/cap), per hex per second.
                          // At 3-of-8 that is a first arrival in ~35s -- deliberately close
                          // to the 45s cadence of the settler timer it replaced, so E3
                          // changed WHERE people are born without changing how fast.
                          // Growth visibly slows as a hex fills. The ONE growth knob.
  // THE WIDE-PLAY TAX (2026-08-25). Every step of administrative distance from
  // the seat adds this fraction to a hex's upkeep, so holding far ground costs
  // more per person than holding near ground.
  //
  // This is the one number that makes the game losable, and the reason is
  // arithmetic: production and upkeep were BOTH linear in population with a
  // fixed margin between them, so every person added carried their own positive
  // surplus and no size ever strained. A flat per-capita sink cannot catch a
  // per-capita source. Distance is what makes the sink grow faster than the
  // source -- an empire that spreads pays more per head for every head.
  // See design.md, The Economy Must Be Able To Break You.
  upkeepPerDistance: 0.28,
  starveCost: 5,          // food-equivalent of one starvation death (E4): while the larder
                          // is empty, every 5 food of unpaid upkeep kills one person at the
                          // frontier. Deficit-proportional -- a deep shortfall kills fast, a
                          // near-balance kills slowly, and each death shrinks the deficit,
                          // so famine converges on what the land can actually feed.
  // MARCH-HOLDS (2026-08-25). A fortified hex adds FLAT defensive strength to
  // itself and its neighbours -- flat and not a multiplier, deliberately: a
  // multiplier on an army of zero is still zero, and walls have to fight for a
  // player who has no soldiers. That is most of what you are buying when you
  // give up a hex's entire output.
  // HALVED 2026-08-25. At 9, and stacking in range, march-holds let a player
  // with NO ARMY AT ALL turn back 64-90% of raids -- walls doing the army's job
  // rather than supporting it. A naked settlement should still lose; a defended
  // one that actually has fighters should feel the difference.
  fortStrength: 4,        // strength each march-hold contributes in range
  fortRange: 1,           // hex distance it reaches: itself and the ring around it
  armyPerHex: 2,          // the army cap (E5): each held hex supports this many standing
                          // units, in every era -- the levy re-homed to the land, per the
                          // owner's ruling ("make it serve the hex"). Territory is what
                          // lets you fight.
  claimScale: 1.18,       // escalating claim costs (E4, owner playtest finding: settling was
                          // trivial): each claim beyond the starting trio multiplies the
                          // era's base cost by this much again -- the same per-copy idiom
                          // buildings already use. The 10th hex costs ~3x its era base.
  speeds: [1, 2, 4, 8, 12],    // simulation multipliers the header button cycles through.
                               // Integers only: speed is implemented as N ordinary steps per
                               // tick, not one big one -- see the loop in boot().
  // Per-resource base caps live on each era's resource list below, not here.
  storageAdd: 100,        // extra cap per storage building
  stoneToolsBonus: 0.08,  // flat additive bump to ALL gather multipliers from the Stone Tools upgrade
  bronzeToolsBonus: 0.15, // ditto, Bronze Tools -- stacks additively on top of Stone Tools
  ironToolsBonus: 0.22,   // ditto, Iron Tools -- the tool tiers stack additively forever
  buildSpeed: 1.0,        // global construction pace (seconds of progress per real second)
  conflictBaseChance: 0.0018,  // per-second base raid chance, before population scaling -- tripled
                                // after playtesting: original value averaged ~19min at pop 15, and
                                // a real session of well over an hour saw zero organic raids (a few
                                // percent likely by chance alone, but not the intended feel). This
                                // targets ~6-7min at pop 15, similar cadence to Sickness (~11min).
  conflictPopScale: 0.03,      // each point of population adds this fraction to the base chance
  // A RAID TAKES A SHARE, NOT A HEADCOUNT (2026-08-25). The old `1 + raidSize/8`
  // killed one or two people -- 0.4% of a 228-soul realm, and less every hour a
  // run continues. A fraction of the struck hex stays meaningful at every scale,
  // which is the whole point: nothing about the danger may decay as you grow.
  // Scaled by raid size, so a scouting party stings and a host is a catastrophe.
  raidTollShare: 0.05,         // share of the struck hex taken, PER POINT of raid size
  raidTollMax: 0.6,            // ...but never more than this of one hex in one blow
  // A RICH REALM ATTRACTS A HOST (2026-08-25). Raid FREQUENCY already scaled
  // with population; raid SIZE did not, and that was the same error as the
  // economy's: damage per raid was O(one hex) while the empire was O(hexes), so
  // the fraction you lost SHRANK as you grew. Percentage tolls alone cannot fix
  // that -- the host itself has to grow.
  //
  // It also does a second job worth having: repelChance is
  // defense/(defense + raidSize), so bigger hosts make an ARMY necessary at
  // scale rather than optional. Population at which raids roughly double.
  raidSizePopScale: 400,
  // Sickness scales with population for the same reason conflict does: a threat
  // that does not grow with you is a threat you outgrow.
  sicknessPopScale: 0.02,
  // ...and a counter now SOFTENS rather than prevents. This share of events
  // always gets through, however much you have built against them, so no hazard
  // can be permanently retired by construction.
  counterFloor: 0.35,
  counterBonus: 2.0,           // strength multiplier for the unit type that counters a raid.
                               // NOTE: non-countering units multiply by 1, never below -- units
                               // are never penalised for being the wrong type, only un-bonused.
  counterCasualtyRelief: 0.5,  // how much a fully-countered raid softens the costly-repel roll
  // Provisions, paid up front when a campaign marches. PER FIGHTER, plus a
  // flat overhead for the column itself -- an army eats in proportion to its
  // size, and marching everyone you own should be a decision about whether
  // you can feed them (owner ruling, 2026-08-25). This replaced a flat 30
  // that cost the same for one soldier as for twenty, which left nothing but
  // an arbitrary headcount cap to make a big army feel big.
  campaignFoodBase: 10,        // the column's own overhead, whatever its size
  campaignFoodPerUnit: 7,      // and what each fighter eats on the road
  plunderFraction: 0.4,        // share of each stock resource a victorious campaign carries home
  siegeWallBonus: 6,           // siege engines hit walls at this multiple of their strength
  wallRetreatLoss: 0.35,       // chance a failed breach costs one fighter (before armor)
  caravanRaidChance: 0.25,     // chance a caravan is lost en route while any warlike neighbor is Hostile
  hostileConflictMult: 1.5,    // home-raid frequency multiplier per Hostile warlike neighbor
  saveKey: "idleCiv.v6",
};

// One tick of the simulation, in seconds of world time (phase 4). Authoring
// stays per-second everywhere -- rates, chances, build times -- and the
// engine advances in exactly this slice, every time. The clock is a COUNT
// (S.tick); this constant is the exchange rate back into seconds.
export const TICK_SECONDS = CONFIG.tickMs / 1000;

