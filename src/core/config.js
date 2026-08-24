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
  popGrowthRate: 0.015,   // r in the logistic dP/dt = r*P*(1 - P/cap), per hex per second.
                          // At 3-of-8 that is a first arrival in ~35s -- deliberately close
                          // to the 45s cadence of the settler timer it replaced, so E3
                          // changed WHERE people are born without changing how fast.
                          // Growth visibly slows as a hex fills. The ONE growth knob.
  starveCost: 5,          // food-equivalent of one starvation death (E4): while the larder
                          // is empty, every 5 food of unpaid upkeep kills one person at the
                          // frontier. Deficit-proportional -- a deep shortfall kills fast, a
                          // near-balance kills slowly, and each death shrinks the deficit,
                          // so famine converges on what the land can actually feed.
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

