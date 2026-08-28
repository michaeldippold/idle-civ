import { DEF_INDEX, active } from "../content/compile.js";
import { builtCount, growthSpendRate, hexPopSum, hexYield, holdCount, holdings, upkeepMouths, world } from "../map/map.js";
import { CONFIG, TICK_SECONDS } from "./config.js";
import { S, me } from "./state.js";
import { freeUnits } from "../sim/armies.js";
import { chronicle } from "../core/bus.js";

// ---------- Derived values ----------------------------------
// The play clock, derived: the tick count is the master record, seconds are
// a display. Old saves that carried seconds are converted once at load().
export function playtime() { return S.tick * TICK_SECONDS; }

// Seconds as a clock reading. Lives here rather than in the interface because
// the simulation's own pacing telemetry prints it, and a formatter is not a
// view.
export function fmtTime(totalSec) {
  const t = Math.max(0, Math.floor(totalSec));
  const s = t % 60, m = Math.floor(t / 60) % 60, h = Math.floor(t / 3600);
  return h > 0
    ? `${h}h ${String(m).padStart(2, "0")}m`
    : `${m}m ${String(s).padStart(2, "0")}s`;
}
// housing() died in E3, and housingPerHut() followed it in the same grave one
// sweep later: the land's carrying capacity is the only ceiling there is. The
// accessor outlived its era-fact by so long that no manifest declared the
// field any more -- it had been returning undefined to nobody.
// What to call the capital. A player-given name is a PROPER NOUN and so does
// not re-denominate with the era the way `tileNoun` does -- your Greenhollow is
// still Greenhollow when it stops being a clearing and becomes a holdfast.
// Falls back to the game's own words, which is the common case: naming is
// optional and skipping it must cost nothing.
// ---------- The odometer -----------------------------------
// THE TOPLINE POPULATION NUMBER (owner ruling, 2026-08-25): the count of real
// beings under your rule, which is hex population times what one unit of it
// stands for in this age. It REPLACES the true count on screen rather than
// sitting beside it -- two population readouts leave "which number matters?"
// permanently unresolved, and the one that should win is the one true to the
// fiction. The small number does not vanish; it retreats to the tile, where it
// is a lever and belongs.
//
// Rule 1 is intact and is what keeps this flavour rather than a second economy:
// NOTHING reads this. Every gate, cost, cap and stepper still reads me().pop and
// the hex sums. Deleting this function would change no outcome in the game --
// which is the test of whether an odometer is still an odometer.
//
// Derived, never stored (rule 2): it cannot drift from the truth, it
// re-denominates automatically at a border, and it needs no save field.
export function soulsPerPerson(p) { return active(p).soulsPerPerson || 1; }
export function souls(p) { const who = p || me(); return who.pop * soulsPerPerson(who); }

// The ONE place the small-numbers pillar is deliberately suspended (design.md:
// "one formatter for one display, not the pillar being abandoned"). Grouped
// digits while they can still be read as a quantity, compact once they cannot.
// Do not let this grow into a general compaction system -- if any OTHER number
// in this game needs it, that is a design bug, not a display one.
const SOUL_TIERS = [
  [1e15, "Qa"], [1e12, "T"], [1e9, "B"], [1e6, "M"],
];
export function fmtSouls(n) {
  n = Math.floor(n);
  for (const [size, suffix] of SOUL_TIERS) {
    if (n >= size) {
      const v = n / size;
      // Three significant figures, so the number still MOVES visibly at every
      // scale -- 1.23T ticking to 1.24T reads as growth; 1T sitting at 1T does
      // not, and the jumps are the whole point (rule 3).
      return (v >= 100 ? v.toFixed(0) : v >= 10 ? v.toFixed(1) : v.toFixed(2)) + suffix;
    }
  }
  return n.toLocaleString("en-US");
}

export function seatName(p) {
  const n = ((p || me()).seatName || "").trim();
  return n || "Your Seat";
}
export function seatIsNamed(p) { return !!((p || me()).seatName || "").trim(); }

export function totalUnits(p) { return Object.values((p || me()).units).reduce((a, b) => a + b, 0); }
// Under a levy (Iron onward) population SUPPORTS the army instead of
// containing it: every holdfast stays in the assignable pool, and the war
// bands stand apart. Stone/Bronze keep the old fiction -- a person who
// becomes a soldier leaves the fields for good.
export function civilians(p) { const who = p || me(); return who.pop - totalUnits(who); }   // the levy died in E5

// Army capacity under a levy: holdfasts x rate. Queued training counts
// against it the moment it's queued, same instant-reservation rule popCost
// always had.
// The army cap (E5): each held hex supports armyPerHex standing units, in
// every era -- the levy re-homed to the land. Territory is what lets you
// fight. (No map -- harness fixtures -- means no cap.)
export function levyCap(p) {
  const who = p || me();
  return S.map ? holdCount(who.id) * CONFIG.armyPerHex : Infinity;
}
export function levyUsed(p) {
  const who = p || me();
  return totalUnits(who) + who.buildQueue.filter((q) => q.kind === "unit").length;
}
// jobsUsed() and releaseOrder() died here in E2 with the jobs system they
// served: people are not assigned, they LIVE somewhere (design.md,
// Population Lives Somewhere).
// Anyone currently reserved by an in-progress (or still-waiting) unit order --
// consumed the instant it's queued, not when it completes.
export function reserved(p) {
  // (The `levy` era-fact escape hatch was removed 2026-08-25: the levy died
  // in E5 and no manifest has declared one since -- the compiler asserts the
  // field is gone. Every era's recruits consume a real person.)
  const who = p || me();
  return who.buildQueue.reduce((sum, q) => {
    const def = defById(q.id, who);
    return sum + (def && def.popCost ? def.popCost : 0);
  }, 0);
}
// idle() died in E2: nobody is "unassigned" when people live on the land.

// Units marching with an expedition are alive (still in me().units, still eat,
// still count toward pop) but they are NOT HOME: they don't defend, and home
// casualties can't take them. Deployment is derived from me().expeditions rather
// than tracked separately, so it can never desync.
export function deployedCount(unitId, p) {
  return (p || me()).expeditions.reduce((sum, ex) => sum + ((ex.units && ex.units[unitId]) || 0), 0);
}
// EVERYTHING COMMITTED IS SPOKEN FOR -- to an expedition still counting down,
// or (since armies took the field) to an army standing somewhere on the board.
// The arithmetic lives in sim/armies.js rather than here: two answers to "how
// many can I give an order to" is how a roster starts lying.
export function availableUnits(unitId, p) { return freeUnits(unitId, p || me()); }

// Tool upgrades lift every gather rate (including the ores -- better tools cut
// ore too); boost buildings lift one resource each.
export function mults(p) {
  const who = p || me();
  const tools = (who.upgrades.stoneTools  ? CONFIG.stoneToolsBonus  : 0)
              + (who.upgrades.bronzeTools ? CONFIG.bronzeToolsBonus : 0)
              + (who.upgrades.ironTools   ? CONFIG.ironToolsBonus   : 0);
  const out = {};
  // TECH ONLY (2026-08-25). Tool upgrades lift every gather rate, including
  // the ores -- better tools cut ore too. The per-resource BUILDING boost that
  // also lived here is gone: those buildings became structures standing on the
  // ground they improve, so improving a resource is now a thing you do to a
  // HEX, at that hex's rate, where a rival can see it and take it.
  for (const r of active(who).resources) out[r.id] = 1 + tools;
  return out;
}

export function caps(p) {
  const out = {};
  for (const r of active(p).resources) {
    // FLAT AND ERA-AUTHORED (4c, 2026-08-25): the manifest is the whole
    // answer. Nothing a player builds moves a ceiling any more -- the era is
    // the budget -- and legacy storage counts in old saves are inert.
    out[r.id] = r.baseCap;
  }
  return out;
}

// Gross production per second, per resource, plus the food upkeep line. Upkeep
// is charged on total population (me().pop), which already includes Soldiers --
// no separate formula needed for "units eat too." This reports what workers
// dig up, EXCLUDING converters -- step() applies those separately via
// runConverters. The ledger displays ledgerRates() (below), which folds the
// converter flows back in for an honest what's-happening-to-the-pile view.
export function rates(p) {
  const who = p || me();
  const m = mults(who);
  const prod = {};
  for (const r of active(who).resources) prod[r.id] = 0;
  // ONE formula, from the first minute to the last (engine rework E2):
  // output = people x per-capita rate x terrain. The hex's FLOORED population
  // works the land -- the same whole people the tile detail shows -- so what
  // you read is what you earn. A tile the rebuilt world doesn't know (a
  // harness fixture, a mid-migration save) works at par rather than silently
  // at zero.
  const owned = holdings(who.id);
  const pops = (S.map && S.map.pop) || {};
  // EVERY OWNED HEX PRODUCES (2026-08-25). This used to walk the allocation
  // map, so a hex nobody had pointed at anything sat idle -- which is what
  // made the border bread-default and the "your holdfasts await direction"
  // hint necessary. Ground works itself now, so the dominion IS the loop.
  for (const tid of owned) {
    // Ask the seam for the resource AND its rate. Bare ground reads its
    // terrain; a structure carries its own flat number; a March-hold answers
    // null and yields nothing. None of that is this loop's business.
    const y = hexYield(tid, who);
    if (!y || !(y.res in prod)) continue;
    const people = Math.floor(pops[tid] || 0);
    if (people <= 0) continue;
    prod[y.res] += people * CONFIG.baseRate * y.rate * (m[y.res] || 1);
  }
  // Upkeep is charged on the people who actually exist -- the hex sum -- plus
  // the war bands, who live outside the population under a levy. Per-capita
  // on both sides, so the feed ratio survives any scale.
  // Armies eat in EVERY era now: units live outside the hex populations, so
  // they are always extra mouths. (They were free at Stone/Bronze during the
  // E2-E4 window, which was a known quirk, not a design.)
  // DISTANCE-WEIGHTED (2026-08-25). Hex population is charged by how far it
  // lives from the seat; the army is charged at par, since it musters with you
  // rather than sitting out on the frontier. Harness fixtures with no map fall
  // back to the plain headcount so nothing off-board changes behaviour.
  const held = S.map && world ? upkeepMouths(who) : hexPopSum(who.id);
  const mouths = held + totalUnits(who);
  const upkeep = mouths * CONFIG.upkeep * (who.upgrades.fireMastery ? 0.85 : 1);
  return Object.assign(prod, { upkeep, foodNet: prod.food - upkeep });
}

// What each converter is actually running at RIGHT NOW, as net per-second
// flows (+output, -input). Mirrors runConverters' three clamps. The input
// clamp counts this second's incoming production alongside the stock, so a
// Forge fed at exactly its consumption rate -- the designed equilibrium --
// reads as running steadily instead of flickering with the stock's float
// remainder.
export function converterFlows(prod, p) {
  const who = p || me();
  const c = caps(who);
  const flows = {};
  for (const def of (active(who).structures || [])) {
    if (!def.converts) continue;
    const owned = builtCount(def.id, who.id);
    if (owned <= 0) continue;
    const spec = def.converts;
    let batches = owned * spec.rate;
    for (const k in spec.in)  batches = Math.min(batches, ((who.res[k] || 0) + (prod[k] || 0)) / spec.in[k]);
    for (const k in spec.out) batches = Math.min(batches, ((c[k] || 0) - (who.res[k] || 0)) / spec.out[k]);
    if (!(batches > 0)) continue;
    for (const k in spec.in)  flows[k] = (flows[k] || 0) - spec.in[k] * batches;
    for (const k in spec.out) flows[k] = (flows[k] || 0) + spec.out[k] * batches;
  }
  return flows;
}

// The LEDGER's view of rates: gross production plus converter flows -- what
// is actually happening to each pile, same spirit as food's net line. The
// simulation deliberately does NOT use this: step() applies production and
// runConverters separately, and folding flows into rates() would convert
// everything twice.
export function ledgerRates(p) {
  const r = rates(p);
  const flows = converterFlows(r, p);
  for (const k in flows) r[k] += flows[k];
  // ...and net of what the larder is spending on GROWTH, which the engine
  // deducts inside growPopulation. Without this term the ledger printed
  // "+0.22/s" over a falling stock (owner, 2026-08-25). The engine's own
  // rates().foodNet stays growth-free on purpose: step() applies growth
  // separately, and folding it in would spend the food twice.
  r.foodNet = r.food - r.upkeep - growthSpendRate;
  return r;
}

// Population growth is a background process, not an event -- and since the
// economy rework (2026-08-25) it is BOUGHT: growPopulation pays
// CONFIG.growthFoodCost per head, scaling with realm size, straight from the
// larder. (The sentence that stood here -- "settlers are FREE, no food
// price" -- described the E3 model and survived two rewrites unread.)
// accrueGrowth() -- the free settler timer -- died in E3. Growth is local
// (people grow toward each hex's cap) and expansion is a claim you pay for.

// What each queue card should SAY. Only the front item is under construction
// (see step()), so a queued item has two different numbers about it and they
// answer different questions:
//
//   own     -- how long it takes to build, once someone starts
//   waiting -- how long until anyone starts on it
//   done    -- waiting + own, the answer to "when will I have it"
//
// The card used to print `done` for every item with no other change, so a
// QUEUED card counted down while its progress bar sat at 0%. Both numbers were
// honest and together they told a lie: the owner watched a card in position two
// "shave off like 7 or 8 seconds" and reasonably read it as building early.
// Nothing was building early. The wait was shrinking, which is a different
// sentence and now gets said as one.
export function queueTiming(queue, buildSpeed) {
  const secs = (t) => Math.max(1, Math.ceil(t / buildSpeed));
  let ahead = 0;
  return (queue || []).map((item, i) => {
    const row = {
      uid: item.uid,
      active: i === 0,
      own: secs(item.remaining),
      waiting: i === 0 ? 0 : secs(ahead),
      done: secs(ahead + item.remaining),
    };
    ahead += item.remaining;
    return row;
  });
}

export function capWord(w) { return w.charAt(0).toUpperCase() + w.slice(1); }
// Good enough for every unit name this game will ever have ("Horseman" ->
// "Horsemen", everything else takes an s). Not a general pluralizer.
export function pluralize(name) { return name.endsWith("man") ? name.slice(0, -3) + "men" : name + "s"; }

// How many of this building/upgrade/unit are already owned or waiting in the
// queue -- keeps escalating prices (and one-time/capped limits) honest even
// when you queue several at once.
export function pendingCount(id, p) { return (p || me()).buildQueue.filter((q) => q.id === id).length; }

export function buildCost(def, p) {
  const who = p || me();
  if (def.kind !== "building") return { ...def.base };  // upgrades & units: flat, never scale
  const n = (who.builds[def.id] || 0) + pendingCount(def.id, who);
  const out = {};
  for (const k in def.base) out[k] = Math.ceil(def.base[k] * Math.pow(def.scale, n));
  return out;
}
export function canAfford(cost, p) {
  const who = p || me();
  for (const k in cost) if (who.res[k] < cost[k]) return false;
  return true;
}
export function isCapped(def, p) {
  const who = p || me();
  return def.kind === "building" && def.cap != null &&
    (who.builds[def.id] || 0) + pendingCount(def.id, who) >= def.cap;
}
// Resolve a buildable id to its def. The active manifest wins -- that's what
// gives a log line or a queue card its era-correct name -- with DEF_INDEX as
// the fallback for ids that have left the manifest but can still be referred
// to (a capstone finishing at the very moment it retires itself).
export function defById(id, civ) {
  const m = active(civ);
  // Structures are searched here too since 2026-08-25. They were the one def
  // kind outside this lookup, which was fine while the only structure was the
  // farm and wrong the moment the Forge and the Medicine Tent moved onto the
  // board: both re-dress across eras, and everything that asks "what is this
  // id, right now?" should get one answer from one place.
  return m.buildings.find((b) => b.id === id) ||
         m.upgrades.find((u) => u.id === id) ||
         m.units.find((u) => u.id === id) ||
         (m.structures || []).find((d) => d.id === id) ||
         DEF_INDEX[id];
}

// Once a building/upgrade/unit's reveal() condition has been true, it stays
// visible forever -- otherwise a threshold-based reveal (e.g. "wood >= 8")
// could flicker the whole panel back into hiding the moment that resource
// dips, which is exactly the kind of un-reveal nothing else in this game does.
export function isRevealed(def) {
  const key = "rev:" + def.id;
  if (S.seen[key]) return true;
  if (def.reveal()) { S.seen[key] = true; return true; }
  return false;
}

