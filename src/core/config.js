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
  baseHousing: 3,
  settlerIntervalSeconds: 45,  // a new settler arrives this often while housing has room -- free.
                               // THE growth-pacing dial; first guess, tune in play.
                               // (Retires in engine-rework E2/E3; logistic hex growth below
                               // is its successor and both run during E1's observation window.)
  popGrowthRate: 0.015,   // r in the logistic dP/dt = r*P*(1 - P/cap), per hex per second.
                          // At 3-of-8 that is a first arrival in ~35s, near the settler
                          // cadence above; growth visibly slows as a hex fills. The ONE
                          // growth knob (engine rework E1).
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
  campaignFoodCost: 30,        // provisions paid up front when a campaign marches
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

