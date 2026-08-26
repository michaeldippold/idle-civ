import { active } from "../content/compile.js";
import { DEFAULT_STANCE, stanceById } from "./battle.js";
import { isOwned } from "../map/map.js";
import { me, playerById } from "../core/state.js";

// ---------- ARMIES ------------------------------------------
// The board's answer to "where are my soldiers". Until now a unit was a number
// in a roster and nothing more: `p.units.soldier = 6` meant six soldiers
// existed, somewhere, and they defended whatever the sim decided to attack. An
// EXPEDITION was the only way one ever left, and an expedition is a countdown
// rather than a place -- it targets an adversary, not a hex, and while it runs
// the column is simply "away".
//
// An army is an expedition that knows where it is standing. That is the whole
// idea, and it is what turns a loosely simulated neighbour into a player: an
// army occupies ground, can be seen on it, can be walked into, and fights with
// the resolver in battle.js rather than a strength number.
//
// WHAT p.units MEANS. It is still EVERY unit you own, home or away -- the
// convention expeditions already established, and worth keeping because the
// population mirror and popCost accounting both count it. An army LISTS a
// subset that is currently committed. So the one question worth asking of the
// roster -- how many of these can I actually give an order to right now -- is
// answered in one place, by freeUnits() below.

export function armiesOf(p) {
  const who = p || me();
  if (!who.armies) who.armies = [];
  return who.armies;
}
export function armyById(uid, p) {
  return armiesOf(p).find((a) => a.uid === uid) || null;
}
export function armySize(army) {
  if (!army || !army.roster) return 0;
  let n = 0;
  for (const k in army.roster) n += army.roster[k] || 0;
  return n;
}
// The one army a player has standing on a hex. One per player per hex is the
// rule (an army is a single object; splitting is a fiddle, and disband-and-
// reform is the split mechanic, priced in travel time).
export function armyAt(hexId, p) {
  return armiesOf(p).find((a) => a.at === hexId) || null;
}

export function inArmies(unitId, p) {
  return armiesOf(p).reduce((n, a) => n + ((a.roster && a.roster[unitId]) || 0), 0);
}
export function inExpeditions(unitId, p) {
  const who = p || me();
  return (who.expeditions || []).reduce((n, ex) => n + ((ex.units && ex.units[unitId]) || 0), 0);
}
// HOW MANY OF THIS UNIT YOU CAN ACTUALLY GIVE AN ORDER TO. Everything committed
// -- to an army standing somewhere, or to an expedition still counting down --
// is spoken for. derived.js delegates to this rather than keeping a second
// answer, because two answers to this question is how a roster starts lying.
export function freeUnits(unitId, p) {
  const who = p || me();
  return (who.units[unitId] || 0) - inArmies(unitId, who) - inExpeditions(unitId, who);
}

// The roster in the shape the resolver wants: unit DEFS, not ids, because the
// resolver is deliberately ignorant of manifests and reads dice off the def it
// is handed. Reads the owner's OWN era -- a Bronze neighbour fields Bronze
// units against your Stone ones, which is most of what an era gap means.
export function armyRoster(army, p) {
  const who = p || me();
  const defs = active(who).units;
  const out = [];
  for (const def of defs) {
    const n = (army.roster && army.roster[def.id]) || 0;
    if (n > 0) out.push({ def, n });
  }
  return out;
}

// A GARRISON IS JUST AN ARMY STANDING ON YOUR OWN GROUND. There is no second
// concept and no second rule set -- the same object defends a hex, marches on
// one, and dies on one. That is the whole point of putting them on the board.
export function garrisonRoster(hexId, p) {
  const who = p || me();
  const army = armyAt(hexId, who);
  return army ? armyRoster(army, who) : [];
}

// ---- Forming and disbanding ------------------------------------------------

// Reasons a muster is refused, as a string the interface can say out loud
// rather than a silent no-op.
export function formRefusal(hexId, counts, p) {
  const who = p || me();
  if (!isOwned(hexId, who.id)) return "You can only raise an army on ground you hold.";
  if (armyAt(hexId, who)) return "An army already stands here.";
  let total = 0;
  for (const id in counts) {
    const n = counts[id] || 0;
    if (n < 0) return "That is not a number of soldiers.";
    if (n > freeUnits(id, who)) return "You do not have that many to give.";
    total += n;
  }
  if (total < 1) return "An army needs somebody in it.";
  return null;
}

export function formArmy(hexId, counts, stance, p) {
  const who = p || me();
  if (formRefusal(hexId, counts, who)) return null;
  const roster = {};
  for (const id in counts) if (counts[id] > 0) roster[id] = counts[id];
  const army = {
    uid: ++who.buildSeq,
    at: hexId,
    roster,
    // THE STANCE IS SET WHEN THE GROUP IS CREATED, loudly, so it is a choice
    // actively made rather than a default nobody read. It stays editable while
    // the army marches and freezes the moment a battle seals.
    stance: stanceById(stance).id,
    order: null,
  };
  armiesOf(who).push(army);
  return army;
}

// DISBAND ONLY ON YOUR OWN TERRITORY. Otherwise disband beats marching home: an
// army eight hexes deep could evaporate and reappear at the capital instantly,
// which teleports units for free and makes retreat meaningless. Your soldiers
// disperse because they are already home; an army caught deep is genuinely
// caught. The same rule covers a force parked outside an enemy hex, since that
// ground is usually not yours -- attackers cannot dissolve out of trouble, a
// defender reorganising inside their borders can.
//
// The troops return to the UNIT pool, not to the population. Units carry
// popCost, so a soldier is a person already spent out of the workforce, and
// disbanding a FORMATION does not discharge its soldiers. Turning soldiers back
// into people is a different action with a different problem (hexes have
// terrain caps and may have no room) and it is not this one.
export function disbandRefusal(uid, p) {
  const who = p || me();
  const army = armyById(uid, who);
  if (!army) return "There is no such army.";
  if (army.inBattle) return "They are in the middle of a fight.";
  if (!isOwned(army.at, who.id)) return "They can only disperse on ground you hold.";
  return null;
}

export function disbandArmy(uid, p) {
  const who = p || me();
  if (disbandRefusal(uid, who)) return false;
  const list = armiesOf(who);
  const i = list.findIndex((a) => a.uid === uid);
  if (i < 0) return false;
  // Nothing to hand back: p.units already counts them. The army simply stops
  // spoken-for, which is the whole of what disbanding is.
  list.splice(i, 1);
  return true;
}

export function setStance(uid, stance, p) {
  const who = p || me();
  const army = armyById(uid, who);
  // Editable while marching, frozen the moment the battle seals: a standing
  // order right up until it becomes a battle input.
  if (!army || army.inBattle) return false;
  army.stance = stanceById(stance).id;
  return true;
}

// Every army on a hex, across every player -- the question contact will ask.
export function armiesOnHex(hexId, players) {
  const out = [];
  for (const p of players || []) {
    const a = armyAt(hexId, p);
    if (a) out.push({ p, army: a });
  }
  return out;
}
