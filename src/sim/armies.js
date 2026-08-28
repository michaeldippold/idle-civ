import { active } from "../content/compile.js";
import { DEFAULT_STANCE, stanceById } from "./battle.js";
import { CONFIG } from "../core/config.js";
import { chartGround, isOwned, isSighted, ownerOf, pathBetween, structureDef, world } from "../map/map.js";
import { hexDistance } from "../map/model.js";
import { S, me, playerById } from "../core/state.js";
import { record } from "../core/journal.js";

// WHAT JOURNALS HERE, AND WHAT DOES NOT (S3, the antagonist spec): a verb
// records itself when a HUMAN seat issued it -- a human's decisions live
// outside the simulation, so the journal is the only record of them, and
// (seed + tick + journal) is the whole game. A KEYED civ's calls do NOT
// journal: today's clockwork decides everything from the seed and the tick,
// so its calls are already implied by the replay re-running the sim -- and
// recording them would double-issue every bot order on playback. When the
// brain lands (Part III) its decisions are seed-drawn too, and the same rule
// holds. Mechanism calls (a raider turning home, a repelled party re-aimed)
// go through the same functions and are covered by the same gate.
function journal(who, verb, args) {
  if (who.key == null) record(verb, args, S.tick, who.id);
}

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
  journal(who, "formArmy", { hex: hexId, counts: Object.assign({}, roster), stance: army.stance });
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
  journal(who, "disbandArmy", { uid });
  return true;
}

export function setStance(uid, stance, p) {
  const who = p || me();
  const army = armyById(uid, who);
  // Editable while marching, frozen the moment the battle seals: a standing
  // order right up until it becomes a battle input.
  if (!army || army.inBattle) return false;
  army.stance = stanceById(stance).id;
  journal(who, "setStance", { uid, stance: army.stance });
  return true;
}

// CAN THE PLAYER SEE AN ARMY STANDING HERE? Three kinds of eyes, all from the
// fog canon's list of what emits sight ("your units, your structures, and
// settled/owned hexes"): sighted ground; YOUR OWN GROUND and the ring beside
// it -- your people live there, and an army on or next to your territory is
// seen by definition; and presence, your own army on or beside the hex.
// Stateless on purpose: eyes move when what carries them moves. (Lived in
// ui/map.js for a day; moved here 2026-08-26 because the sim needs it too --
// the sighting notification fires on the same fact the renderer draws by.)
export function canSeeArmyAt(hexId) {
  if (isSighted(hexId)) return true;
  if (isOwned(hexId)) return true;
  if (armyAt(hexId, me())) return true;
  const place = world && world.places[hexId];
  if (place) {
    for (const n of place.adj) {
      if (isOwned(n) || armyAt(n, me())) return true;
    }
    // A WATCHTOWER IS EYES (2026-08-28, the first sight-emitting structure --
    // the fog canon's structures clause made real). Any structure the player
    // owns that carries `vision` sees armies that far out, which is what buys
    // the earlier raid warning a watchtower exists for. Stateless like every
    // other eye here: demolish the tower and the country goes dark again.
    if (S.map && S.map.built) {
      for (const [id, sid] of Object.entries(S.map.built)) {
        const def = structureDef(sid);
        if (!def || !def.vision || ownerOf(id) !== S.me) continue;
        const at = world.places[id];
        if (at && hexDistance(at.q, at.r, place.q, place.r) <= def.vision) return true;
      }
    }
  }
  return false;
}

// The band an army's size falls in: war party / column / host. The same
// vocabulary launchCampaign has used since the idle game, whose comment
// settled the hard half already -- "the word follows the SIZE of the thing
// that actually left, not an era fact". Cutoffs are ABSOLUTE, never per era:
// era-normalised bands would erase the era gap, and an Iron host is supposed
// to be terrifying next to a Stone war party. The tier drives the disc's
// thickness on the board; crossing a threshold is meant to be an event.
export function armyBand(n) {
  if (n <= 5) return { id: "warParty", name: "war party", tier: 0 };
  if (n < CONFIG.armyHostSize) return { id: "column", name: "column", tier: 1 };
  return { id: "host", name: "host", tier: 2 };
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

// ---- Marching --------------------------------------------------------------
// The same step rule the map already uses for logistics (routes.js): your own
// country costs half a step, unowned land a full one, water three. Slow
// crossings, never impossible, so an island seat cannot deadlock a run.
//
// Marching through your own realm being FAST and an invasion being SLOW is the
// whole reason a relief force is a real idea: you move inside your borders at
// twice the speed of the army coming at you.
export function stepCost(hexId, p) {
  const who = p || me();
  if (!world || !world.places[hexId]) return Infinity;
  if (isOwned(hexId, who.id)) return 0.5;
  return world.places[hexId].terrain === "water" ? 3 : 1;
}

export function marchRefusal(uid, toId, p) {
  const who = p || me();
  const army = armyById(uid, who);
  if (!army) return "There is no such army.";
  if (army.inBattle) return "They are in the middle of a fight.";
  if (army.at === toId) return "They are already there.";
  if (!world || !world.places[toId]) return "There is no such ground.";
  if (!pathBetween(army.at, toId, who)) return "There is no way there from here.";
  return null;
}

// DISPATCH IS AN ORDER AIMED AT A BOARD YOU LOOKED AT. The path is computed
// once, here, and kept -- an army walks the road it was sent down rather than
// re-deciding every tick, which is what lets it be met on the way.
export function orderMarch(uid, toId, p) {
  const who = p || me();
  if (marchRefusal(uid, toId, who)) return false;
  const army = armyById(uid, who);
  army.order = { to: toId };
  army.path = pathBetween(army.at, toId, who);
  army.step = 0;
  army.progress = 0;
  return true;
}

export function haltArmy(uid, p) {
  const who = p || me();
  const army = armyById(uid, who);
  if (!army || army.inBattle) return false;
  army.order = null; army.path = null; army.step = 0; army.progress = 0;
  journal(who, "haltArmy", { uid });
  return true;
}

// Where they are between two hexes, 0..1, for drawing them on the road.
export function marchProgress(army, p) {
  if (!army || !army.order || !army.path) return 0;
  const next = army.path[army.step];
  if (!next) return 0;
  const cost = stepCost(next, p);
  return cost > 0 && Number.isFinite(cost) ? Math.min(1, (army.progress || 0) / cost) : 0;
}
export function marchingTo(army) {
  return army && army.order && army.path ? army.path[army.step] || army.order.to : null;
}

// ARRIVING ON ONE OF YOUR OWN ARMIES MERGES INTO IT. One army to a hex is the
// rule everywhere else, and this is how it stays true without a special case:
// reinforcements join the garrison, the standing army keeps its stance because
// it is the one that was already holding this ground, and the arriving object
// simply stops existing. This is not battle reinforcement -- there is no battle
// -- it is two of your own columns becoming one outside a fight.
function mergeInto(host, comer, who) {
  for (const id in comer.roster) host.roster[id] = (host.roster[id] || 0) + comer.roster[id];
  const list = armiesOf(who);
  const i = list.indexOf(comer);
  if (i >= 0) list.splice(i, 1);
}

function arrive(army, who, hooks) {
  army.order = null; army.path = null; army.step = 0; army.progress = 0;
  const host = armiesOf(who).find((a) => a !== army && a.at === army.at);
  if (host) mergeInto(host, army, who);
  // The survivor of a merge is the host; whoever stands here is who arrived.
  // Contact (sieges, conquest of bare enemy ground) hangs off this seam --
  // armies.js knows how to walk, not what a border means.
  if (hooks && hooks.arrived) hooks.arrived(host || army, who);
}

// One player's armies, one tick. Deliberately not a pathfinding pass: the road
// was decided at dispatch.
//
// The optional HOOKS are contact's seam (sim/contact.js), and they point one
// way only -- contact imports armies, never the reverse:
//   barred(hexId, army, who)  -> true bars the step: a contested hex is locked,
//                                the army parks where it stands, its order dies
//                                (the second wave is an affirmative new order).
//   parked(army, who, hexId)  -> told after a bar, for the notification.
//   entered(army, who, hexId) -> after each step; "halt" means a battle sealed
//                                and this army stops being walkable.
//   arrived(army, who)        -> at the order's end (sieges, conquest).
// Hookless calls still walk -- the harness's older fixtures depend on it.
export function marchArmies(dt, p, hooks) {
  const who = p || me();
  for (const army of armiesOf(who).slice()) {
    if (army.inBattle || !army.order || !army.path) continue;
    army.progress = (army.progress || 0) + dt / CONFIG.marchSeconds;
    // A while loop, not an if: at high speed a tick can cross more than one hex
    // of your own country, and an army that could only ever advance one step per
    // tick would silently slow down as the clock sped up.
    for (;;) {
      const next = army.path[army.step];
      if (next === undefined) { arrive(army, who, hooks); break; }
      const cost = stepCost(next, who);
      if (!Number.isFinite(cost) || army.progress < cost) break;
      if (hooks && hooks.barred && hooks.barred(next, army, who)) {
        army.order = null; army.path = null; army.step = 0; army.progress = 0;
        if (hooks.parked) hooks.parked(army, who, next);
        break;
      }
      army.progress -= cost;
      // Where they stepped FROM, kept on the army: it is the retreat
      // destination if the very next hex turns out to hold a battle they lose.
      army.lastHex = army.at;
      army.at = next;
      // The column charts the road it walks (fog.js) -- sticky, like all
      // charting, and into the MARCHER's own fog (S1): a rival's column
      // learns the ground it crosses exactly as yours does. This is why your
      // own disc never stands in the void.
      chartGround([next], who);
      army.step++;
      if (hooks && hooks.entered && hooks.entered(army, who, next) === "halt") break;
      if (army.step >= army.path.length) { arrive(army, who, hooks); break; }
    }
  }
}

// Every civilization's armies move on the same clock. Symmetry is the point:
// there is no separate code path for a neighbour's column, so anything the
// board shows about yours is true of theirs.
export function tickArmies(dt) {
  for (const p of S.players || []) marchArmies(dt, p);
}
