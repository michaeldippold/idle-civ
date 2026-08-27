import { active } from "../content/compile.js";
import { CONFIG } from "../core/config.js";
import { rng } from "../core/rng.js";
import { chronicle } from "../core/bus.js";
import { S, me, rivals } from "../core/state.js";
import { armiesOf, armyAt, armyBand, armySize, canSeeArmyAt, orderMarch } from "./armies.js";
import { raidSender } from "./expeditions.js";
import { raidGround, reconcileReservations, rollRaidSize, rollRaidType, stealResources } from "./combat.js";
import { hexPop, killAt, strikeHex, structureDef, world } from "../map/map.js";

// ---------- RAIDERS (slice A5): the inbound war -----------------------------
// A raid is an ARMY now. The old conflict event rolled dice against
// `repelChance = defense / (defense + raidSize)` and told you what had already
// happened; this module spawns a real force at the sender's seat and marches
// it at your country under the same contact rules as everything else. The
// whole pipeline the era clock's wire built survives intact -- raidSender()
// decides WHO, rollRaidType() decides the SHAPE out of their own era's roster,
// rollRaidSize() decides the NUMBER with the era-gap ramp -- but the output is
// a roster handed to an army instead of a numerator handed to a fraction.
//
// What that buys, and it is the whole 4X pivot: a raid is VISIBLE (a disc
// walking out of the hills, under the same fog rules as any army), it takes
// TIME to arrive (warning time -- the thing scouting exists to buy more of),
// it can be MET (garrison the hex, or march out and intercept: the mover is
// the attacker), and when it is fought, the RESOLVER fights it -- dice, walls,
// firing slots, worst-first casualties, the stance. There is exactly one
// combat system now.
//
// RAIDERS ARE COWARDS BY DESIGN. Their stance is withdraw-at-a-quarter: a
// garrison that bloodies them sends them home, which is what a raid was
// always supposed to be -- a hit on soft ground, not a war. And they RAID,
// never conquer: a war party that reaches an undefended hex pillages it
// (stores and a toll of people, the same arithmetic the old event used) and
// turns for home. Ground changes hands when ARMIES take it, not when bandits
// visit it.

// The sender's seat: where their armies muster and where survivors return.
// Adversary seats are placed by the generator and marked on the world.
function seatOf(civ) {
  if (!world) return null;
  for (const id in world.places) {
    if (world.places[id].adversary === civ.key) return id;
  }
  return null;
}

// What unit a raid SHAPE means, read against the sender's own manifest.
// Riders are horsemen where the sender's age can field them; everything else
// (and every age that cannot) marches on foot. The type roll already comes
// from the sender's era roster, so a Stone people essentially never rolls
// riders -- but "essentially never" is not "never", and a def their manifest
// does not declare would silently vanish from the resolver's roster read.
function unitFor(raid, civ) {
  const preferred = raid && raid.id === "riders" ? "horseman" : "soldier";
  const defs = active(civ).units;
  return defs.some((u) => u.id === preferred) ? preferred : defs[0].id;
}

// TARGET SELECTION: the same frontier-weighted draw the old raid used
// (strikeHex: population x administrative distance -- the frontier is where
// the torches come), with one new instinct: RAIDERS SCOUT THEIR TARGETS. A
// draw that lands on garrisoned or walled ground is redrawn once, so raiders
// mostly hit soft hexes -- which is what raiders have always done -- but only
// mostly, so a garrison still gets a fight to show for itself sometimes.
// Positional defence, never a global negation: your walls protect the hex
// they stand on by deterrence, and the torches go elsewhere.
function hardened(hexId) {
  if (armyAt(hexId, me())) return true;
  const sid = S.map && S.map.built && S.map.built[hexId];
  if (!sid) return false;
  const def = structureDef(sid);
  return !!(def && def.fortifies);
}

function raidTarget() {
  let pick = strikeHex("raid");
  if (pick && hardened(pick)) {
    const second = strikeHex("raid");
    if (second) pick = second;
  }
  return pick;
}

function nameGate(civ) {
  // Whether you can NAME them is the age's contact fact -- the same gate the
  // old attribution used. The arithmetic always knows; the prose only knows
  // what your age knows.
  if (active().contact === "none") return null;
  return active().adversaries.find((a) => a.id === civ.key) || null;
}

// ---- The spawn -------------------------------------------------------------
// Called by the conflict event's trigger (content/lib.js), which kept its
// cadence and lost its arithmetic. Returns the army, or null when no raid
// could form -- no warlike sender, no seat on the map, one already out, or
// nowhere to strike.
export function spawnRaid() {
  const sender = raidSender();
  if (!sender || !sender.civ) return null;
  const civ = sender.civ;
  // ONE RAID OUT PER SENDER. A people is a people, not a spawner: their war
  // party has to come home (or die) before the next one musters.
  if (armiesOf(civ).some((a) => a.intent === "raid" || a.intent === "returning")) return null;
  const seat = seatOf(civ);
  if (!seat) return null;
  const target = raidTarget();
  if (!target) return null;
  const size = Math.max(1, Math.round(rollRaidSize(sender)));
  const raid = rollRaidType(sender);
  const uid = unitFor(raid, civ);
  // The units are MUSTERED, not conjured from a levy we do not simulate:
  // granted into the civ's pool and committed to the army in the same breath,
  // so casualties in battle deduct from a real roster and survivors genuinely
  // return home to it.
  civ.units[uid] = (civ.units[uid] || 0) + size;
  const army = {
    uid: ++civ.buildSeq,
    at: seat,
    roster: { [uid]: size },
    // Withdraw at a quarter lost: cowardice as doctrine. See the header.
    stance: "quarter",
    order: null,
    intent: "raid",
    home: seat,
  };
  armiesOf(civ).push(army);
  orderMarch(army.uid, target, civ);
  if (!army.order) {
    // No road there at all -- unmuster rather than leave a ghost at the seat.
    despawn(civ, army);
    return null;
  }
  // NO CHRONICLE HERE. You learn about a raid when you SEE it (the sighting
  // check below), not when it is decided -- fog applies to news too.
  return army;
}

// ---- Arrival, pillage, and the road home -----------------------------------

export function turnHome(army, civ) {
  army.intent = "returning";
  if (army.at === army.home) { despawn(civ, army); return; }
  orderMarch(army.uid, army.home, civ);
  if (!army.order) despawn(civ, army);   // cut off entirely: they scatter
}

function despawn(civ, army) {
  const list = armiesOf(civ);
  const i = list.indexOf(army);
  if (i >= 0) list.splice(i, 1);
  // The units stay in the civ's pool: they went home, they did not evaporate.
  // A people raided often enough genuinely accumulates veterans.
}

// The raider reached its target and nobody stopped it: the old raid's
// arithmetic, on the new raid's legs. Stores are plundered (the same
// settlement-wide fraction), the struck hex pays a toll of people (the same
// capped share), and the war party turns for home carrying everything.
export function pillageAt(army, civ, hexId) {
  const size = armySize(army);
  stealResources(size);
  const here = hexPop(hexId);
  const share = Math.min(CONFIG.raidTollMax, CONFIG.raidTollShare * size);
  const toll = Math.max(1, Math.round(here * share));
  const died = killAt(hexId, toll);
  reconcileReservations();
  const named = nameGate(civ);
  const where = world.places[hexId] ? world.places[hexId].terrain : "land";
  const souls = died === 1 ? "a soul is lost" : `${died} souls are lost`;
  chronicle(named
    ? `${named.name.charAt(0).toUpperCase() + named.name.slice(1)} put the ${where} to the torch — ${souls}, and your stores are plundered.`
    : `Raiders put the ${where} to the torch — ${souls}, and your stores are plundered.`, "bad");
  turnHome(army, civ);
}

// The raider found walls where it wanted a village. Raiders do not besiege --
// grinding masonry for weeks is an army's work, and a war party has neither
// the patience nor the engines -- so the walls win by standing there, which
// is most of what walls are FOR.
export function repelledByWalls(army, civ, hexId) {
  const named = nameGate(civ);
  const where = world.places[hexId] ? world.places[hexId].terrain : "land";
  chronicle(named
    ? `${named.name.charAt(0).toUpperCase() + named.name.slice(1)} test the walls at the ${where} and think better of it. They withdraw the way they came.`
    : `A war party tests the walls at the ${where} and thinks better of it.`, "good");
  turnHome(army, civ);
}

// ---- The per-tick sweep ----------------------------------------------------
// Called from tickMilitary after battles: sighting notifications for EVERY
// foreign army (raid or not -- warning time is warning time), and shepherding
// for raiders whose orders have run out.
export function tickRaiders() {
  for (const civ of rivals()) {
    for (const army of armiesOf(civ).slice()) {
      // THE WARNING. The moment a hostile column first comes into your view --
      // sighted ground, your own territory's eyes, or an army of yours beside
      // it -- the Chronicle says so, once. This is the payoff of raids taking
      // time to arrive, and the thing scouting will buy more of.
      if (!army.sightedByMe && canSeeArmyAt(army.at)) {
        army.sightedByMe = true;
        const named = nameGate(civ);
        const band = armyBand(armySize(army)).name;
        const where = world.places[army.at] ? world.places[army.at].terrain : "land";
        const def = (active(civ).adversaries || []).find((a) => a.id === civ.key);
        const ground = def ? raidGround(def) : "the dark";
        chronicle(named
          ? `A ${band} of ${named.name} is sighted at the ${where}, moving on your country.`
          : `A ${band} is sighted at the ${where}, out of ${ground}.`, "bad");
      }
      if (army.inBattle || army.order) continue;
      // A raider with no order left is a raider whose plan ended -- it fought,
      // it was parked by a locked hex, or its march completed somewhere odd.
      // Doctrine is simple: anything that survives heads home; anything home
      // disperses. (Arrival at the TARGET never reaches here -- contact's
      // arrived hook pillages or turns them before the order clears.)
      if (army.intent === "raid") turnHome(army, civ);
      else if (army.intent === "returning") {
        if (army.at === army.home) despawn(civ, army);
        else turnHome(army, civ);
      }
    }
  }
}
