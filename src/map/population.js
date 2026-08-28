import { active } from "../content/compile.js";
import { S, me, playerById } from "../core/state.js";
import { CONFIG } from "../core/config.js";
import { rng } from "../core/rng.js";
import { chronicle } from "../core/bus.js";
import { world } from "./world.js";
import { holdings, isOwned, ownerOf, releaseTile } from "./ownership.js";
import { hexUse, hexYield, setHexBuild } from "./structures.js";
import { adminDistance } from "./routes.js";

// ---------- People live on the land, and the land can fail them ----------
// THE ACTING CIV IS A PARAMETER (S1, the antagonist spec). Every function here
// used to read me() -- fine while exactly one civ had population books, wrong
// the moment a bot or a second human does. The idiom is the military half's:
// take the civ (or its pid), default to me() so the interface keeps its
// convenience, and let sim callers say WHOSE books they mean. Until S2, only
// keyless civs (humans) carry population books at all -- ensurePop guards it.

// p.pop is a MIRROR (E3): the floored hex sum plus the standing army.
// Everything legacy that still reads it -- reveal gates, the levy cap,
// event scaling, civilians() -- sees the real population.
export function syncPopMirror(p) {
  const who = p || me();
  if (!S.map || !S.map.pop) return;
  let units = 0;
  for (const k in who.units) units += who.units[k] || 0;
  who.pop = hexPopSum(who.id) + units;
}

// ---------- Population lives on hexes (engine rework E1) ----------
// design.md, "Population Lives Somewhere". In E1 this is pure state: it
// grows, saves, and displays, and NOTHING reads it yet -- steppers still run
// the economy, so the curve can be watched and tuned live before anything
// depends on it. Population is a VARIABLE, not a control: no setter is
// exported to the UI, only to the world (growth here; plague/raids/starvation
// write to it in later slices).

// Carrying capacity of a hex: terrain x era -- the OWNER's era, since the cap
// is a fact about how that civ's age works the land. Defaults to the viewer.
export function capOf(id, civ) {
  const spec = active(civ).map;
  if (!spec || !spec.popCaps || !world || !world.places[id]) return 0;
  return spec.popCaps[world.places[id].terrain] || 0;
}

export function hexPop(id) {
  return S.map && S.map.pop ? Math.floor(S.map.pop[id] || 0) : 0;
}

// The odometer: total population is the SUM of real per-hex numbers.

export function hexPopSum(pid) {
  if (!S.map || !S.map.pop) return 0;
  let sum = 0;
  for (const id of holdings(pid)) sum += Math.floor(S.map.pop[id] || 0);
  return sum;
}

// Seed population for owned hexes that have none, prune entries for hexes no
// longer owned. Idempotent, like everything else at this layer. The seat
// starts at startPop (the three survivors); any other hex enters the books at
// 2 -- the party that claimed it.
//
// KEYED CIVS HAVE NO POPULATION BOOKS YET: a bot's people arrive in S2 (the
// per-player economy). Until then this is a no-op for them, so a caller can
// honestly say ensurePop(atkP.id) for whoever just took ground and the guard
// sorts out who actually keeps books.
export function ensurePop(pid) {
  if (!S.map || !world) return;
  const who = pid == null ? me() : playerById(pid);
  if (!who || who.key !== null) return;
  if (!S.map.pop) S.map.pop = {};
  // Ground taken LATER arrives as a settling party and grows into the place:
  // that dip is what makes a claim an investment rather than a free upgrade.
  for (const id of holdings(who.id)) {
    if (!(id in S.map.pop)) S.map.pop[id] = 2;
  }
  for (const id in S.map.pop) if (!isOwned(id, who.id)) delete S.map.pop[id];
}

// THE STARTING TRIO ARRIVES FULL (owner ruling, 2026-08-25). Your opening
// ground is worked to what its terrain supports from the first frame.
//
// This began as an economy bug and turned out to be an idle-game remnant.
// Under one resource per terrain, food is capped by your FOOD ground while
// EVERY hex adds mouths -- so a realm holding one plains, one forest and one
// hills at a third of capacity produced barely more food than it ate, and
// claiming a fourth barren hex tipped it permanently negative: stranded at
// zero food, unable to grow and unable to afford the claim that would fix it.
// Raising yields would have papered over it. The actual defect was that "a
// wanderer joins your settlement" was LOAD-BEARING -- the opening was a wait,
// which is precisely what this game stopped being two pivots ago.
//
// Wanderers still arrive. They arrive to fill ground you have just taken,
// which is a 4X sentence rather than an idle one.
export function fillStartingGround(p) {
  const who = p || me();
  if (!S.map || !S.map.pop || !world) return;
  for (const id of holdings(who.id)) S.map.pop[id] = Math.max(2, capOf(id, who));
}

// Logistic growth toward each hex's cap: dP/dt = r * P * (1 - P/cap).
// Fractional population is stored; every reader floors for display. Growth
// only -- this function never lowers a number (loss belongs to the world's
// events, in later slices), so a hex above a shrunken cap simply holds.
// What the larder spent on growth LAST TICK, per second -- display only.
// Published by growPopulation so the ledger can show the TRUE food line
// (owner bug report, 2026-08-25 late: "+0.22/s" printed while the stock fell,
// because growth's spending was invisible to the rate). One source of truth:
// this is measured from the actual deduction, never re-derived.
export let growthSpendRate = 0;

export function growPopulation(dt, p) {
  const who = p || me();
  growthSpendRate = 0;
  if (!S.map || !S.map.pop || !world) return;
  // No one is born during a famine: growth waits for the larder.
  if (who.res.food <= 0) return;
  const r = CONFIG.popGrowthRate;
  const before = hexPopSum(who.id);
  // What the larder can actually raise this tick. Growth is BOUGHT, not free
  // (CONFIG.growthFoodCost), so a thin surplus grows slowly and a full one
  // grows fast -- and a settlement that is only just feeding itself cannot
  // replace what a raid took.
  const perHead = CONFIG.growthFoodCost * (1 + (who.pop || 0) / CONFIG.growthCostPopScale);
  let budget = who.res.food / perHead;
  for (const id of holdings(who.id)) {
    const cap = capOf(id, who);
    if (cap <= 0) continue;
    let p = S.map.pop[id] || 0;
    // No rekindling: an emptied hex is not yours to repopulate any more, it is
    // unsettled ground you may claim again (loseHexIfEmpty above). The old
    // 0.2-soul revival died with rule 9 on 2026-08-25.
    if (p <= 0) continue;
    if (p >= cap) continue;
    if (budget <= 0) break;                       // the larder is spent for now
    let gain = r * p * (1 - p / cap) * dt;
    if (gain > budget) gain = budget;             // grow only what you can feed
    budget -= gain;
    who.res.food -= gain * perHead;
    growthSpendRate += (gain * perHead) / dt;
    const next = p + gain;
    // The logistic APPROACHES its cap and never attains it; snap the last
    // hundredth so a full hex eventually reads "8 of 8" instead of hovering
    // at 7 forever. (~7 minutes from the far side of the curve at r=0.015.)
    S.map.pop[id] = cap - next < 0.01 ? cap : next;
  }
  const after = hexPopSum(who.id);
  if (after !== before) {
    syncPopMirror(who);
    // Lifetime arrivals, for the game-over screen. Counted in WHOLE people
    // crossing an integer, so the stat matches what the Chronicle announced
    // rather than the fractional curve underneath it. (p.bought was declared
    // in E1 and never incremented until 2026-08-25 -- the end screen read
    // "Arrivals welcomed: 0" for every run ever played.)
    if (after > before) who.bought += Math.max(0, Math.floor(after) - Math.floor(before));
    // The Chronicle keeps its pulse: each whole arrival is told in the era's
    // own words -- but only while the settlement is SMALL. A hundred-soul
    // dominion gaining a person a second would drown the Chronicle in birth
    // announcements.
    if (after > before && after <= 25) chronicle(active(who).arrivalLine, "good", who.id);
  }
}

// ---------- The world strikes hexes (E5) ----------
// Sickness and raids stopped killing "someone, nowhere" -- they strike a HEX
// and kill people there. The two weightings are the two mitigation tracks:
// sickness is person-weighted (every soul equally at risk, so dense hexes
// host more fevers), raids are exposure-weighted (population x administrative
// distance -- the frontier is where the torches come).
export function strikeHex(kind, victim) {
  const who = victim || me();
  if (!S.map || !S.map.pop || !world) return null;
  const weights = [];
  let total = 0;
  for (const id of holdings(who.id)) {
    const p = Math.floor(S.map.pop[id] || 0);
    if (p < 1) continue;
    const w = kind === "raid" ? p * (1 + adminDistance(id, who)) : p;
    weights.push([id, w]);
    total += w;
  }
  if (!total) return null;
  let roll = rng() * total;
  for (const [id, w] of weights) {
    if (roll < w) return id;
    roll -= w;
  }
  return weights[weights.length - 1][0];
}

// Kill n people at a hex. Returns how many actually died. Land is never
// lost; the mirror and the reservation books are settled immediately.
export function killAt(id, n) {
  if (!S.map || !S.map.pop || !(id in S.map.pop)) return 0;
  const before = Math.floor(S.map.pop[id]);
  const killed = Math.min(before, Math.max(0, Math.floor(n)));
  S.map.pop[id] = Math.max(0, S.map.pop[id] - killed);
  // The mirror that changed is the hex OWNER's, not the viewer's.
  syncPopMirror(playerById(ownerOf(id)) || undefined);
  // A raid or a plague that takes the last person takes the ground with it --
  // the same rule famine follows, because losing ground is a property of the
  // hex being empty rather than of what emptied it.
  loseHexIfEmpty(id);
  return killed;
}

// WHAT THE EMPIRE COSTS TO HOLD, in mouths-equivalent.
//
// Every person eats `CONFIG.upkeep`; a person living FAR from the seat eats
// more, because getting anything to them costs more. The multiplier is
// `1 + upkeepPerDistance x adminDistance`, so the seat itself is at par and the
// frontier is dear.
//
// The shape is what matters, not the number: this makes upkeep grow with
// dominion SPREAD as well as size, which is the only way a sink outruns a
// per-capita source. A compact realm of forty is cheap; a stretched realm of
// forty is not. Geography becomes an economic decision rather than only a
// logistical one.
//
// The army is charged at par -- it lives with you, not out on the frontier --
// and returns as a plain headcount so callers that only want mouths still work.
export function upkeepMouths(p) {
  const who = p || me();
  if (!S.map || !S.map.pop || !world) return 0;
  let mouths = 0;
  for (const id of holdings(who.id)) {
    const people = Math.floor(S.map.pop[id] || 0);
    if (people <= 0) continue;
    const d = adminDistance(id, who);
    const far = Number.isFinite(d) ? d : 0;
    mouths += people * (1 + CONFIG.upkeepPerDistance * far);
  }
  return mouths;
}

// AN EMPTY HEX IS LOST (owner ruling, 2026-08-25, reversing rule 9).
//
// Ground used to stay yours when it emptied -- a ghost that rekindled from 0.2
// souls once the larder refilled, on the reasoning that "a ghost town you can
// bring back is more interesting than a hex that vanishes". The `dominionCap`
// shipped two days AFTER that ruling and changed its arithmetic: under a cap, a
// ghost occupies one of your seven slots while producing nothing, so you were
// punished twice and could not re-plan. Losing it frees the slot.
//
// What actually changed is narrower than it sounds. A ghost and a lost hex both
// yield nothing; the difference is FREE RECOVERY versus paying the claim again.
// So famine now costs the investment, not only the people -- which is the point:
// it punishes stretching yourself thin, or not watching a threat.
//
// It self-corrects rather than spiralling, because claim escalation reads
// `owned.length` (actions.js): losing ground makes the next claim CHEAPER.
//
// ONE function, called from every path that can empty a hex -- famine, sickness,
// a raid -- because "you lose ground when nobody is left on it" is a property of
// the ground being empty, not of what emptied it.
export function loseHexIfEmpty(id) {
  if (!S.map || !world) return false;
  // WHOSE ground empties is read off the tile, never assumed to be the
  // viewer's (S1): the owner's seat is the one hex this function refuses to
  // touch, because a seat emptying ends that civ's run instead.
  const own = ownerOf(id);
  if (own == null) return false;
  const civ = playerById(own) || me();
  if (id === (civ.seat || world.home)) return false;   // the seat ends the run instead
  if ((S.map.pop[id] || 0) >= 1) return false;

  const built = hexUse(id);
  releaseTile(id);
  delete S.map.pop[id];
  setHexBuild(id, null);            // whatever stood here goes with the ground
  const noun = (active(civ).map && active(civ).map.tileNoun.singular) || "holding";
  // A structure is destroyed with the hex, and there is no refund -- the same
  // trade the deliberate demolish carries (design.md, Building on a Hex).
  if (built.kind === "structure") {
    chronicle(`The last of them leave the ${noun}. What they built there is abandoned to the weather.`, "bad", civ.id);
  } else {
    chronicle(`The last of them leave the ${noun}. The ground is no longer yours.`, "bad", civ.id);
  }
  // syncDominion() stood here and was the one edge that would have made this
  // module import the hub back. What it does that matters after a release --
  // reconcile the books -- is exactly these two calls; its other two jobs
  // (claim the seat, prune builds off ground you do not hold) are already done
  // above, and the seat is the one hex this function refuses to touch.
  ensurePop(civ.id);
  syncPopMirror(civ);
  return true;
}

// The famine drain: distance governs EXPOSURE, never efficiency. When the
// larder is empty, unpaid upkeep accumulates, and every `starveCost` worth of
// it kills one person at the peopled hex FURTHEST from the seat -- the empire
// starves from its frontier inward, and dies only when the seat itself empties.
// An emptied holding is LOST, not ghosted (see loseHexIfEmpty above).
let famineAnnounced = false;
export function starveTick(deficit, dt, p) {
  const who = p || me();
  if (!S.map || !S.map.pop || !world) return false;
  S.map.starve = (S.map.starve || 0) + deficit * dt;
  if (!famineAnnounced) {
    famineAnnounced = true;
    chronicle("Famine. The stores are empty, and the frontier feels it first.", "bad", who.id);
  }
  const seat = who.seat || world.home;
  while (S.map.starve >= CONFIG.starveCost) {
    S.map.starve -= CONFIG.starveCost;
    // The victim: the peopled hex with the greatest administrative distance,
    // ties broken by id so the order is deterministic.
    let victim = null, worst = -1;
    for (const id of holdings(who.id)) {
      if ((S.map.pop[id] || 0) < 1) continue;
      const d = adminDistance(id, who);
      if (d > worst || (d === worst && victim !== null && id > victim)) { worst = d; victim = id; }
    }
    if (!victim) return true;   // no one left anywhere: the caller ends the run
    S.map.pop[victim] = Math.max(0, S.map.pop[victim] - 1);
    if (S.map.pop[victim] < 1) {
      S.map.pop[victim] = 0;
      if (victim === seat) { syncPopMirror(who); return true; }   // the seat is empty: the caller ends the run
      loseHexIfEmpty(victim);
    }
  }
  syncPopMirror(who);
  return false;
}

// Famine ends the moment the books balance again; the next one announces anew.
export function endFamine() { famineAnnounced = false; if (S.map) S.map.starve = 0; }
