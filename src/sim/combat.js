import { ERA_ORDER, active } from "../content/compile.js";
import { rng } from "../core/rng.js";
import { CONFIG } from "../core/config.js";
import { civilians, defById, reserved } from "../core/derived.js";
import { S, me } from "../core/state.js";
import { chronicle } from "../core/bus.js";

// ---------- Events / combat helpers -------------------------
// Event content lives in EVENT_LIB up top; which events are live is the
// active manifest's `events` slate (see resolveEvents). What follows here is
// the machinery those events call into.

// (CONFLICT_FLAVOR died with the raid event, A5 2026-08-26: a raid is an army
// now, and sim/raiders.js writes its own prose at spawn, sighting, pillage and
// repulse. The two-voices rule -- anonymous at Stone, named once the age has
// contact -- survives there as nameGate().)

// The country a people came out of, from their `homeTerrain`. Deliberately
// vague nouns: the Chronicle should place a raid without handing the player
// map coordinates they have not charted.
const RAID_GROUND = {
  hills:  "the high ground",
  river:  "the water",
  plains: "the flats",
  forest: "the trees",
};
export function raidGround(adv) {
  return (adv && RAID_GROUND[adv.homeTerrain]) || "the dark";
}

// Flavor lines are templates, and every people-name in the roster begins with
// a lowercase article ("the Hill Clans"). That reads correctly mid-sentence
// and wrongly at the start of one -- and a line may start MORE THAN ONE
// sentence with a substitution, which is how "...before anyone can hold them
// back. the Hill Clans, and they knew the way." got written and would have
// shipped. Capitalising only the first character catches the first case and
// misses the second, so do it wherever a sentence actually begins.
export function sentenceCase(line) {
  return line.replace(/(^|[.!?]\s+)([a-z])/g, (_, lead, ch) => lead + ch.toUpperCase());
}

// Raid size rolls independently of everything else -- usually a small
// scouting party, rarely something much larger.
export const RAID_SIZES = [
  { weight: 60, size: 2 },
  { weight: 30, size: 5 },
  { weight: 10, size: 10 },
];
// The authored sizes are the SHAPE of the distribution -- usually a scouting
// party, rarely a host. What scales is the whole curve, with the settlement:
// see CONFIG.raidSizePopScale.
export function raidSizeScale() {
  return 1 + (me().pop || 0) / CONFIG.raidSizePopScale;
}

// HOW MANY AGES AHEAD OF YOU THE SENDER IS. Negative means behind, and behind
// is deliberately worth nothing: falling behind should hurt, getting ahead
// should be safety, and a neighbour you have outrun does not get weaker than
// their own manifest says.
export function eraGap(sender) {
  if (!sender) return 0;
  const civ = sender.civ || sender;
  if (!civ || typeof civ.era !== "string") return 0;
  return Math.max(0, ERA_ORDER.indexOf(civ.era) - ERA_ORDER.indexOf(me().era));
}

// NUMBER, the late-game half of ruling 6. A raid from an age ahead is bigger,
// and the per-age bonus itself RAMPS with how deep the sender's age is -- the
// early ladder is gentle on purpose (bronze barely moved in two thousand
// years) and the last stretch is vertical. That ramp is the difficulty curve
// across the whole span: falling behind gets more dangerous the longer a game
// runs.
export function rollRaidSize(sender) {
  const total = RAID_SIZES.reduce((s, r) => s + r.weight, 0);
  const gap = eraGap(sender);
  const civ = sender && (sender.civ || sender);
  const depth = civ && civ.era ? Math.max(0, ERA_ORDER.indexOf(civ.era)) : 0;
  const eraMult = 1 + gap * CONFIG.raidEraSizeBonus * (1 + depth * CONFIG.raidEraSizeRamp);
  const scale = raidSizeScale() * eraMult;
  let roll = rng() * total;
  for (const r of RAID_SIZES) {
    if (roll < r.weight) return r.size * scale;
    roll -= r.weight;
  }
  return RAID_SIZES[0].size;
}

// What kind of raid shows up is the active manifest's `raidTypes` list.
// (counterUnitFor died with the counter matrix, A5: counters come from WHERE a
// fight happens now -- who can shoot from behind a wall, what can break one --
// not from a unit-vs-unit lookup. The `counters` field survives on unit defs
// because the era-gap skew below still reads it: a shape whose countering unit
// does not EXIST in your age is a shape you have no answer to.)
export function rollRaidType(sender) {
  const civ = sender && (sender.civ || sender);
  const types = active(civ || me()).raidTypes;
  const gap = eraGap(sender);
  // What the DEFENDER could field an answer with, by kind rather than by
  // count: being out of archers is a bad afternoon, having no archers at all
  // is the era gap.
  const answerable = new Set(
    active(me()).units.filter((u) => u.counters).map((u) => u.counters));
  const weightOf = (r) =>
    r.weight * (gap > 0 && !answerable.has(r.id) ? 1 + gap * (CONFIG.raidShapeSkew - 1) : 1);
  const total = types.reduce((s, r) => s + weightOf(r), 0);
  let roll = rng() * total;
  for (const r of types) {
    const w = weightOf(r);
    if (roll < w) return r;
    roll -= w;
  }
  return types[0];
}

// Weapon tiers replace each other rather than stacking -- highest owned wins.
// These read OWNED upgrades, not the shop: a tier bought in a past era keeps
// working after its upgrade leaves the manifest.
export function weaponMultiplier() {
  if (me().upgrades.ironWeapons) return 3.0;
  if (me().upgrades.bronzeWeapons) return 2.2;
  if (me().upgrades.flintSpears) return 1.6;
  return 1.0;
}
// Armor tiers replace the same way -- lowest (best) owned factor wins.
export function armorFactor() {
  if (me().upgrades.steelArmor) return 0.3;
  if (me().upgrades.hideArmor) return 0.5;
  return 1.0;
}

// (unitStrength, militaryStrength and counterCoverage died in A5. They were
// the whole of an army once -- one number, summed across a roster that lived
// nowhere -- and the resolver in battle.js replaced every job they had: dice
// per unit instead of strength, roles instead of the counter matrix, the
// stance instead of the casualty-relief dial. weaponMultiplier and armorFactor
// survive below because CAMPAIGNS still read them; they die with the campaign
// system when armies absorb it.)

export function stealResources(raidSize) {
  const fraction = Math.min(0.5, raidSize * 0.03);
  for (const r of active().resources) {
    me().res[r.id] -= Math.floor((me().res[r.id] || 0) * fraction);
  }
}

export function pick(arr) { return arr[Math.floor(rng() * arr.length)]; }

// How likely a landed hazard is deflected, based on its counter-building count.
// `reducePerUnit` may be a flat number or (S) => number, for counters whose
// strength itself can be upgraded (e.g. Herbal Medicine boosting Infirmary).
// A COUNTER SOFTENS; IT NEVER RETIRES THE THREAT (2026-08-25).
//
// This used to clamp at 1, so enough infirmaries negated sickness OUTRIGHT --
// two or three huts and the hazard was permanently solved, which is a standing
// cost turning into a one-time purchase. Anything that reduces a PROBABILITY
// can be out-built; the fix is a floor that no amount of building crosses.
// See design.md, The Economy Must Be Able To Break You.
// (negateChance() retired 2026-08-25 with its only user. It counted a COUNTER
// BUILDING globally, so three infirmaries standing anywhere retired sickness
// outright. Mitigation is positional now: the sickness event picks its hex
// first and asks healersNear() about THAT hex -- a question a global count
// could not answer. CONFIG.counterFloor survives and is applied there.)

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
  for (let i = me().buildQueue.length - 1; i >= 0 && over > 0; i--) {
    const q = me().buildQueue[i];
    const def = defById(q.id);
    if (!def || !def.popCost) continue;
    for (const k in q.cost) me().res[k] += q.cost[k];
    me().buildQueue.splice(i, 1);
    over -= def.popCost;
    chronicle(`The order for a ${def.name} is abandoned — there is no one left to train.`);
  }
}

// (removeRandomUnit died in A5. Home casualties came from raids, raids are
// armies, and armies lose soldiers through the resolver's worst-goes-first
// order. `casualtyWeight` stays on unit defs for the campaign system's
// removeDeployedUnit, and dies with it.)
