import { ERA_ORDER, active } from "../content/compile.js";
import { syncPopMirror } from "../map/map.js";
import { rng } from "../core/rng.js";
import { dropQueueItem } from "../core/actions.js";
import { CONFIG } from "../core/config.js";
import { availableUnits, civilians, defById, reserved } from "../core/derived.js";
import { S, me } from "../core/state.js";
import { chronicle } from "../core/bus.js";

// ---------- Events / combat helpers -------------------------
// Event content lives in EVENT_LIB up top; which events are live is the
// active manifest's `events` slate (see resolveEvents). What follows here is
// the machinery those events call into.

// Two voices, and which one speaks is decided by the era's `contact` fact --
// see raidAttribution() in sim/expeditions.js. The ANONYMOUS pool is the Stone
// Age's: real danger belonging to nobody on your map, a warband out of the
// dark. The NAMED pool is what Bronze buys you -- the danger acquires a name
// and an address, and it turns out to have been your neighbours all along.
// This is the payoff for putting the roster on the board from minute one.
//
// {raid} is the raid TYPE (warband, massed charge, band of riders); {who} is
// the people; {ground} is the country they came out of. Every named line reads
// with a PLURAL subject, because every people-name in the roster is plural in
// every era ("the hill camps" / "the Hill People" / "the Hill Clans"), and
// none of them takes a possessive -- "the Hill Clans's" is why.
export const CONFLICT_FLAVOR = {
  repelledClean: [
    "A {raid} tests your defenses and thinks better of it. Your line holds.",
    "A {raid} is spotted and driven off before it reaches the settlement.",
  ],
  repelledCleanNamed: [
    "{who} test your defenses and think better of it. Your line holds.",
    "A {raid} comes down out of {ground}. {who} are turned back before they reach the settlement.",
    "{who} probe your line with a {raid} and find it holds. They withdraw the way they came.",
  ],
  raidSucceeds: [
    "A {raid} breaches your defenses. Stores are looted and your fighters pay the price.",
    "The settlement is overrun by a {raid} before anyone can hold them back.",
  ],
  raidSucceedsNamed: [
    "{who} breach your defenses. Stores are looted and your fighters pay the price.",
    "A {raid} out of {ground} overruns the settlement before anyone can hold them back. {who}, and they knew the way.",
    "{who} come with a {raid} and leave with your stores. Your fighters pay for the difference.",
  ],
  civilianLost: [
    "In the chaos, one of your people is caught and does not survive.",
  ],
};

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

// What kind of raid shows up is the active manifest's `raidTypes` list (the
// counter-relationship notes live with it, in the Stone Age authoring).
export function counterUnitFor(raid) { return raid ? active().units.find((u) => u.counters === raid.id) : undefined; }
// SHAPE, the early half of ruling 6. Drawn from the SENDER's roster, and
// skewed by how far ahead they are toward the types you cannot answer.
//
// "An era-ahead raid at Bronze doesn't hit harder so much as hit in a shape
// you can't answer -- archers and horsemen show up while you're still
// mustering spears." The counter matrix already says which shapes those are:
// a type whose countering unit does not EXIST in the defender's age is one
// they have no answer to, however many spears they have.
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
      me().units[def.id] -= 1;
      syncPopMirror();   // the mirror counts the army; the land is untouched
      return def.name;
    }
    roll -= w;
  }
  // Floating-point guard: if rounding walked `roll` past the end, take from
  // whichever type still has someone AT HOME rather than returning null.
  for (let i = units.length - 1; i >= 0; i--) {
    if (availableUnits(units[i].id) > 0) {
      me().units[units[i].id] -= 1;
      syncPopMirror();
      return units[i].name;
    }
  }
  return null;
}
