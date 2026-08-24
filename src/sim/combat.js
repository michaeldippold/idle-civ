import { active } from "../content/compile.js";
import { syncDominion, syncPopMirror } from "../map/map.js";
import { rng } from "../core/rng.js";
import { dropQueueItem } from "../core/actions.js";
import { CONFIG } from "../core/config.js";
import { availableUnits, civilians, defById, reserved } from "../core/derived.js";
import { S } from "../core/state.js";
import { log } from "../ui/log.js";

// ---------- Events / combat helpers -------------------------
// Event content lives in EVENT_LIB up top; which events are live is the
// active manifest's `events` slate (see resolveEvents). What follows here is
// the machinery those events call into.

export const CONFLICT_FLAVOR = {
  repelledClean: [
    "A {raid} tests your defenses and thinks better of it. Your line holds.",
    "A {raid} is spotted and driven off before it reaches the settlement.",
  ],
  raidSucceeds: [
    "A {raid} breaches your defenses. Stores are looted and your fighters pay the price.",
    "The settlement is overrun by a {raid} before anyone can hold them back.",
  ],
  civilianLost: [
    "In the chaos, one of your people is caught and does not survive.",
  ],
};

// Raid size rolls independently of everything else -- usually a small
// scouting party, rarely something much larger.
export const RAID_SIZES = [
  { weight: 60, size: 2 },
  { weight: 30, size: 5 },
  { weight: 10, size: 10 },
];
export function rollRaidSize() {
  const total = RAID_SIZES.reduce((s, r) => s + r.weight, 0);
  let roll = rng() * total;
  for (const r of RAID_SIZES) {
    if (roll < r.weight) return r.size;
    roll -= r.weight;
  }
  return RAID_SIZES[0].size;
}

// What kind of raid shows up is the active manifest's `raidTypes` list (the
// counter-relationship notes live with it, in the Stone Age authoring).
export function counterUnitFor(raid) { return raid ? active().units.find((u) => u.counters === raid.id) : undefined; }
export function rollRaidType() {
  const types = active().raidTypes;
  const total = types.reduce((s, r) => s + r.weight, 0);
  let roll = rng() * total;
  for (const r of types) {
    if (roll < r.weight) return r;
    roll -= r.weight;
  }
  return types[0];
}

// Weapon tiers replace each other rather than stacking -- highest owned wins.
// These read OWNED upgrades, not the shop: a tier bought in a past era keeps
// working after its upgrade leaves the manifest.
export function weaponMultiplier() {
  if (S.upgrades.ironWeapons) return 3.0;
  if (S.upgrades.bronzeWeapons) return 2.2;
  if (S.upgrades.flintSpears) return 1.6;
  return 1.0;
}
// Armor tiers replace the same way -- lowest (best) owned factor wins.
export function armorFactor() {
  if (S.upgrades.steelArmor) return 0.3;
  if (S.upgrades.hideArmor) return 0.5;
  return 1.0;
}

// A single unit type's contribution to defense against a given raid.
// The counter multiplier is either CONFIG.counterBonus or exactly 1 -- never
// below. Being the "wrong" unit costs you the bonus, never your base strength,
// so any army is always better than no army (see design.md).
export function unitStrength(def, raid) {
  const n = availableUnits(def.id);   // an army on campaign isn't home
  if (n <= 0) return 0;
  const matched = !!raid && def.counters === raid.id;
  return n * (def.strength || 1) * weaponMultiplier() * (matched ? CONFIG.counterBonus : 1);
}

export function militaryStrength(raid) {
  return active().units.reduce((sum, def) => sum + unitStrength(def, raid), 0);
}

// What share of your defense comes from the unit that counters this raid.
// Drives how much the costly-repel roll is softened.
export function counterCoverage(raid) {
  const def = counterUnitFor(raid);
  if (!def) return 0;
  const total = militaryStrength(raid);
  if (total <= 0) return 0;
  return Math.min(1, unitStrength(def, raid) / total);
}

export function stealResources(raidSize) {
  const fraction = Math.min(0.5, raidSize * 0.03);
  for (const r of active().resources) {
    S.res[r.id] -= Math.floor((S.res[r.id] || 0) * fraction);
  }
}

export function pick(arr) { return arr[Math.floor(rng() * arr.length)]; }

// How likely a landed hazard is deflected, based on its counter-building count.
// `reducePerUnit` may be a flat number or (S) => number, for counters whose
// strength itself can be upgraded (e.g. Herbal Medicine boosting Infirmary).
export function negateChance(ev) {
  if (!ev.counter) return 0;
  const n = S.builds[ev.counter.building] || 0;
  const reduce = typeof ev.counter.reducePerUnit === "function"
    ? ev.counter.reducePerUnit(S) : ev.counter.reducePerUnit;
  return Math.min(1, n * reduce);
}

// A civilian dies: population drops, and if that leaves more workers assigned
// than civilians alive, the excess is pulled back to idle (wood/stone before
// food, so a starving settlement's last forager is the last to go). Sickness
// floors at 1 survivor; Conflict passes allowZero=true, since it's the one
// hazard allowed to end a run outright (see design.md, Failure).
// removeSettler() died in E5: nobody dies "nowhere" any more. Deaths land on
// a hex (strikeHex/killAt in map/map.js) and the pop mirror keeps the books.

export function reconcileReservations() {
  let over = reserved() - Math.max(0, civilians());
  if (over <= 0) return;
  for (let i = S.buildQueue.length - 1; i >= 0 && over > 0; i--) {
    const q = S.buildQueue[i];
    const def = defById(q.id);
    if (!def || !def.popCost) continue;
    for (const k in q.cost) S.res[k] += q.cost[k];
    S.buildQueue.splice(i, 1);
    over -= def.popCost;
    log(`The order for a ${def.name} is abandoned — there is no one left to train.`);
  }
}

export function removeRandomUnit() {
  // Weighted by headcount AND exposure (`casualtyWeight`), so the front line
  // absorbs most losses. Because every weight is > 0, no type is ever immune:
  // this only bends the odds. With one type fielded it degenerates to "that
  // type dies," which is why an all-archer army gets no protection at all.
  const units = active().units;
  // Home casualties draw only from units actually AT home -- a deployed unit
  // can die on campaign (see resolveCampaign), never to a raid it wasn't in.
  const weightOf = (def) => Math.max(0, availableUnits(def.id)) * (def.casualtyWeight || 1);
  const total = units.reduce((sum, def) => sum + weightOf(def), 0);
  if (total <= 0) return null;

  let roll = rng() * total;
  for (const def of units) {
    const w = weightOf(def);
    if (roll < w) {
      S.units[def.id] -= 1;
      syncPopMirror();   // the mirror counts the army; the land is untouched
      return def.name;
    }
    roll -= w;
  }
  // Floating-point guard: if rounding walked `roll` past the end, take from
  // whichever type still has someone AT HOME rather than returning null.
  for (let i = units.length - 1; i >= 0; i--) {
    if (availableUnits(units[i].id) > 0) {
      S.units[units[i].id] -= 1;
      syncPopMirror();
      return units[i].name;
    }
  }
  return null;
}
