import { active } from "../content/compile.js";
import { CONFIG } from "../core/config.js";
import { makeRng, rng } from "../core/rng.js";
import { chronicle, emit, runEnded } from "../core/bus.js";
import { S, me, playerById } from "../core/state.js";
import { armiesOf, armyAt, armySize, marchArmies } from "./armies.js";
import { resolveBattle } from "./battle.js";
import { pillageAt, repelledByWalls, tickRaiders, turnHome } from "./raiders.js";
import {
  atDominionCap, chartGround, claimTile, ensurePop, holdings, isOwned,
  ownerOf, releaseTile, structureDef, syncCharted, syncPopMirror, world,
} from "../map/map.js";

// ---------- CONTACT (slice A4) ------------------------------
// What happens when two armies stand on one hex: a battle seals, the resolver
// in battle.js decides it, and the ground changes hands. This module is the
// wire between the two halves that already existed -- armies that could march
// (A1-A3) and a resolver that could fight (f0998c4) -- and before it, armies
// walked through each other.
//
// NONE OF THE OLD RAID MACHINERY PASSES THROUGH HERE. `repelChance`,
// `militaryStrength`, `strength`, `fortStrength`-with-range -- all of it is
// idle-game holdover (owner, 2026-08-26: "don't take any of that code as
// gospel"), and it is deliberately NOT bridged into the resolver. It keeps
// running in its own corner until real inbound armies (A5) replace raids as a
// system, and then it dies as a system.
//
// A BATTLE IS A SIM OBJECT, NOT A UI EVENT. It lives in S.battles, saves and
// loads mid-fight, and plays out over ticks -- the sim knows the ending the
// moment the fight seals (the resolver returns the whole script at once), but
// the WORLD does not see it until the last round has ticked through. The
// battle panel, when it arrives, is a replay of this script; it can never
// disagree with the outcome because it is not a second implementation.
//
// WHAT A BATTLE ROW STORES, and why: { id, hex, atk, def, walls, slots, seed,
// round, t }. Each side is { pid, uid, from, roster, stance } where `roster`
// is the SEAL-TIME SNAPSHOT of counts -- never mutated afterward, because it
// is the input the script is recomputed from. The dice are one drawn `seed`
// (taken from the game stream at seal, so save/load resumes the same war),
// and the full script is cached in a WeakMap keyed on the row object: a load
// builds new rows, misses the cache, and recomputes -- bit-identical, because
// the inputs never changed. Casualties land on the LIVE army rosters and unit
// pools as each round plays; the snapshot stays pristine.

function battles() {
  if (!S.battles) S.battles = [];   // legacy saves predate armies entirely
  return S.battles;
}

export function battleAt(hexId) {
  return battles().find((b) => b.hex === hexId) || null;
}
export function battleCount() { return battles().length; }

// The script cache. Keyed on the ROW OBJECT, not the id, so a save/load --
// which builds fresh rows -- naturally misses and recomputes from the sealed
// inputs. That makes the recompute path the TESTED path rather than a code
// path that only runs after a crash.
const scripts = new WeakMap();

function rosterDefs(counts, pid) {
  // The owner's own manifest: a Bronze neighbour fields Bronze units against
  // your Stone ones. Manifests accumulate, so old unit ids still resolve --
  // this is the read that "gate the build, never remove the def" protects.
  const defs = active(playerById(pid)).units;
  const out = [];
  for (const def of defs) {
    const n = counts[def.id] || 0;
    if (n > 0) out.push({ def, n });
  }
  return out;
}

export function scriptOf(b) {
  let s = scripts.get(b);
  if (!s) {
    s = resolveBattle({
      attacker: { roster: rosterDefs(b.atk.roster, b.atk.pid), stance: b.atk.stance },
      defender: { roster: rosterDefs(b.def.roster, b.def.pid), stance: b.def.stance },
      walls: b.walls, slots: b.slots,
      rng: makeRng(b.seed),
    });
    scripts.set(b, s);
  }
  return s;
}

// Walls belong to the hex, and they fight for the DEFENDER only when the
// ground is theirs: an army standing on someone else's fortified hex gets no
// benefit from walls it does not hold. Read from the structure ON the hex --
// the panel law ("everything that fires is standing on the hex") is enforced
// here by construction, because nothing else is even looked at.
function wallsAt(hexId, defenderPid) {
  if (ownerOf(hexId) !== defenderPid) return { walls: 0, slots: 0 };
  // A CAPITAL'S OWN WALLS (B slice): a rival's seat carries the walls its era
  // authored on the adversary def, scaled into resolver units. Stone seats
  // author zero -- an open camp -- and the arc climbs to iron fortresses.
  const place = world && world.places[hexId];
  const defP = playerById(defenderPid);
  // defP.key != null is LOAD-BEARING: ordinary hexes carry adversary: null
  // and the HUMAN's key is null too, so a bare === sent every human-owned hex
  // down this branch with me().walls = 0 -- which silently deleted every
  // march-hold from the resolver. Caught by the fully-walled-realm check.
  if (place && defP && defP.key != null && place.adversary === defP.key) {
    return { walls: (defP.walls || 0) * CONFIG.seatWallScale, slots: CONFIG.fortSlots };
  }
  const sid = S.map && S.map.built && S.map.built[hexId];
  if (!sid) return { walls: 0, slots: 0 };
  const def = structureDef(sid);
  if (!def || !def.fortifies) return { walls: 0, slots: 0 };
  return {
    walls: def.wallPool == null ? CONFIG.wallPool : def.wallPool,
    slots: def.slots == null ? CONFIG.fortSlots : def.slots,
  };
}

// THE SEAL. Orders die, stances freeze, the dice are drawn. From this moment
// the battle is a script being played back, and neither side can add, remove,
// or redirect anything -- reinforcement mid-fight is micro, and the door it
// would walk through is welded shut here.
function freeze(army) {
  army.inBattle = true;
  army.order = null; army.path = null; army.step = 0; army.progress = 0;
}

function nameOf(p) {
  if (!p || p.id === S.me) return "your own";
  const adv = active().adversaries.find((a) => a.id === p.key);
  return adv ? adv.name : "a rival people";
}
function placeWord(hexId) {
  const p = world && world.places[hexId];
  return p ? "the " + p.terrain : "the field";
}

export function sealBattle(hexId, atkArmy, atkP, defArmy, defP) {
  S.battleSeq = (S.battleSeq || 0) + 1;
  freeze(atkArmy);
  if (defArmy) freeze(defArmy);
  const { walls, slots } = wallsAt(hexId, defP.id);
  const b = {
    id: S.battleSeq, hex: hexId,
    atk: { pid: atkP.id, uid: atkArmy.uid, from: atkArmy.lastHex || atkArmy.at,
           roster: Object.assign({}, atkArmy.roster), stance: atkArmy.stance },
    def: { pid: defP.id, uid: defArmy ? defArmy.uid : null,
           roster: defArmy ? Object.assign({}, defArmy.roster) : {},
           stance: defArmy ? defArmy.stance : "never" },
    walls, slots,
    seed: Math.floor(rng() * 0x7fffffff),
    round: 0, t: 0,
  };
  battles().push(b);
  // The panel's cue (wired in ui/wire.js): the seal, each round as it plays,
  // and the ending. Emitted only for wars the human is IN -- a battle you are
  // standing in is visible by definition, and nobody else's dice are shown.
  if (atkP.id === S.me || defP.id === S.me) emit("battleSealed", { b });
  if (atkP.id === S.me) {
    chronicle(walls > 0
      ? `Your army sets against the walls at ${placeWord(hexId)}. The dice will decide it.`
      : `Your army meets ${nameOf(defP)} soldiers at ${placeWord(hexId)}. The dice will decide it.`, "bad");
  } else if (defP.id === S.me) {
    chronicle(`An army of ${nameOf(atkP)} falls upon ${placeWord(hexId)}. Your soldiers stand to.`, "bad");
  }
  return b;
}

// ---- The rounds, played over ticks -----------------------------------------
// The pacing knob is CONFIG.battleRoundSeconds -- tick-driven, so pause stops a
// war mid-round and fast-forward speeds it, the same law the era clock obeys.

function findArmy(p, uid) {
  return p && uid != null ? armiesOf(p).find((a) => a.uid === uid) || null : null;
}

function applyLost(pid, uid, lost) {
  const p = playerById(pid);
  const army = findArmy(p, uid);
  for (const l of lost) {
    if (army) army.roster[l.id] = Math.max(0, (army.roster[l.id] || 0) - l.n);
    if (p) p.units[l.id] = Math.max(0, (p.units[l.id] || 0) - l.n);
  }
  if (pid === S.me && lost.length) syncPopMirror();
}

function playRound(b) {
  const script = scriptOf(b);
  const round = script.rounds[b.round];
  if (!round) { conclude(b, script); return true; }
  applyLost(b.atk.pid, b.atk.uid, round.attacker.lost);
  applyLost(b.def.pid, b.def.uid, round.defender.lost);
  if (b.atk.pid === S.me || b.def.pid === S.me) emit("battleRound", { b, round: b.round });
  if (round.breached && (b.atk.pid === S.me || b.def.pid === S.me)) {
    chronicle(`The wall at ${placeWord(b.hex)} comes down.`, b.def.pid === S.me ? "bad" : "good");
  }
  b.round++;
  if (b.round >= script.rounds.length) { conclude(b, script); return true; }
  return false;
}

export function tickBattles(dt) {
  const list = battles();
  for (let i = list.length - 1; i >= 0; i--) {
    const b = list[i];
    b.t = (b.t || 0) + dt;
    let done = false;
    while (!done && b.t >= CONFIG.battleRoundSeconds) {
      b.t -= CONFIG.battleRoundSeconds;
      done = playRound(b);
    }
    if (done) list.splice(i, 1);
  }
}

// ---- The ending ------------------------------------------------------------

function destroyArmy(p, army) {
  if (!p || !army) return;
  // Whatever still stands in a destroyed army dies with it -- ordinarily
  // nothing (wiped means wiped), but a retreat with nowhere to go ends here
  // too, and those soldiers are genuinely lost. Very board game: no legal
  // placement, the piece comes off.
  for (const k in army.roster) p.units[k] = Math.max(0, (p.units[k] || 0) - army.roster[k]);
  const list = armiesOf(p);
  const i = list.indexOf(army);
  if (i >= 0) list.splice(i, 1);
  if (p.id === S.me) syncPopMirror();
}

function legalRefuge(hexId, p) {
  if (!world || !world.places[hexId]) return false;
  if (battleAt(hexId)) return false;
  for (const other of S.players) {
    if (other.id !== p.id && armyAt(hexId, other)) return false;
  }
  return true;
}

// RETREAT IS FLIGHT, NOT AN ORDER. Preferred destination is the hex the army
// came from; failing that, any adjacent refuge, own ground first. Failing
// everything, the army is lost -- overextending has a price, and this is it.
function retreatArmy(p, army, preferred) {
  if (!p || !army) return;
  army.inBattle = false;
  const adj = (world && world.places[army.at] && world.places[army.at].adj) || [];
  const options = [];
  if (preferred != null) options.push(preferred);
  for (const id of adj) if (isOwned(id, p.id)) options.push(id);
  for (const id of adj) options.push(id);
  const dest = options.find((id) => legalRefuge(id, p));
  if (dest == null) {
    if (p.id === S.me) chronicle("Your army, cut off with nowhere to fall back to, is lost.", "bad");
    destroyArmy(p, army);
    return;
  }
  army.at = dest;
  if (p.id === S.me) chartGround([dest]);
  // Falling back onto one of your own armies merges into it, host's stance
  // standing -- the same law as an ordinary arrival, because it is one.
  const host = armiesOf(p).find((a) => a !== army && a.at === dest);
  if (host) {
    for (const id in army.roster) host.roster[id] = (host.roster[id] || 0) + army.roster[id];
    const list = armiesOf(p);
    list.splice(list.indexOf(army), 1);
  }
}

// CONQUEST. Only ground the DEFENDER held changes hands -- a battle won on
// neutral ground, or on some third party's ground, moves no borders. The human
// answers to the dominion cap ("you cannot govern what the age cannot hold"):
// at cap, the defender still loses the hex but the attacker does not gain it.
// Rivals are not cap-checked -- their economies are not simmed at that grain
// yet, which is A5's problem and flagged there.
function conquer(hexId, atkP, defP) {
  if (ownerOf(hexId) !== defP.id) return;
  // CAPITALS ARE NEVER CONQUERED INSTANTLY -- for them or for you (owner,
  // 2026-08-26). Winning a battle on a seat wins you the RIGHT to sack it
  // unopposed; the nation falls to time on the ground, and the sack timer is
  // the relief window. Your own home hex answers to the same law, which is
  // what stops a single army that caught you away from ending the run on
  // arrival.
  const place = world && world.places[hexId];
  if (place && (place.adversary || hexId === world.home)) {
    if (atkP.id === S.me) {
      chronicle(`Their capital lies open. Order the sack, and hold it long enough, and their story ends.`);
    }
    return;
  }
  releaseTile(hexId);
  const capped = atkP.id === S.me && atDominionCap();
  if (!capped) claimTile(hexId, atkP.id);
  ensurePop(); syncPopMirror(); syncCharted();
  if (atkP.id === S.me) {
    chronicle(capped
      ? `${placeWord(hexId)} is broken and abandoned — this age cannot govern more ground than you already hold.`
      : `${placeWord(hexId)} is taken. The ground is yours.`, "good");
  } else if (defP.id === S.me) {
    chronicle(`${placeWord(hexId)} is lost to ${nameOf(atkP)}.`, "bad");
  }
}

function conclude(b, script) {
  if (b.atk.pid === S.me || b.def.pid === S.me) emit("battleEnded", { b, script });
  const atkP = playerById(b.atk.pid), defP = playerById(b.def.pid);
  const atkArmy = findArmy(atkP, b.atk.uid);
  const defArmy = findArmy(defP, b.def.uid);
  const mine = b.atk.pid === S.me || b.def.pid === S.me;

  // FALLEN WALLS STAY FALLEN. A breach razes the fortification whatever the
  // outcome -- even a failed assault that cracked the wall leaves it cracked,
  // which is most of what a failed assault buys the next one.
  if (script.wallsStart > 0 && script.walls <= 0 && S.map && S.map.built) {
    delete S.map.built[b.hex];
    if (ownerOf(b.hex) === S.me) chronicle("The fortification is rubble. It will not be rebuilt by wishing.", "bad");
  }

  const o = script.outcome;
  if (o === "mutual") {
    destroyArmy(atkP, atkArmy); destroyArmy(defP, defArmy);
    if (mine) chronicle(`The fighting at ${placeWord(b.hex)} ends with no one left standing on either side.`, "bad");
  } else if (script.holder === "defender") {
    if (o === "attackerWiped") destroyArmy(atkP, atkArmy);
    else retreatArmy(atkP, atkArmy, b.atk.from);
    if (defArmy) defArmy.inBattle = false;
    if (b.atk.pid === S.me) {
      chronicle(o === "attackerWiped"
        ? `Your army is destroyed at ${placeWord(b.hex)}. No one returns.`
        : `Your army falls back from ${placeWord(b.hex)} — the standing order held them to it.`, "bad");
    } else if (b.def.pid === S.me) {
      chronicle(`Your soldiers hold ${placeWord(b.hex)}. The attack is broken.`, "good");
    }
  } else {
    if (o === "defenderWiped") destroyArmy(defP, defArmy);
    else if (o === "defenderWithdrew") retreatArmy(defP, defArmy, null);
    if (atkArmy) atkArmy.inBattle = false;
    // A raider that WINS its battle still does not conquer: it pillages the
    // ground it bled for (if it was the defender's) and heads home. Anything
    // less would make bandits a land-transfer mechanism.
    if (atkArmy && atkArmy.intent === "raid") {
      if (ownerOf(b.hex) === defP.id) pillageAt(atkArmy, atkP, b.hex);
      else turnHome(atkArmy, atkP);
    } else if (atkArmy && atkArmy.intent === "sack") {
      beginSack(atkArmy, atkP);
    } else {
      conquer(b.hex, atkP, defP);
    }
    if (b.def.pid === S.me && defArmy && o === "defenderWithdrew") {
      chronicle("Your soldiers withdraw in good order — the standing order held them to it.", "bad");
    } else if (b.def.pid === S.me && o === "defenderWiped" && b.def.uid != null) {
      chronicle(`Your garrison at ${placeWord(b.hex)} is destroyed.`, "bad");
    }
  }

  // THE ATTENTION-TAX RULE (owner): a battle ending with friendly forces
  // parked nearby MUST say so, or a parked army is the game punishing the
  // player for looking away. The second wave is an affirmative order.
  const adj = (world && world.places[b.hex] && world.places[b.hex].adj) || [];
  for (const id of adj) {
    const waiting = armyAt(id, me());
    if (waiting && !waiting.inBattle && !waiting.order) {
      chronicle(`Your army at ${placeWord(id)} awaits orders — the battle beside them is over.`);
      break;
    }
  }
}

// ---- THE SACK (owner ruling, 2026-08-26) -----------------------------------
// The affirmative verb that finishes a war. An army ordered to sack marches to
// the target and, standing UNOPPOSED on enemy ground, tears it down over real
// time: an ordinary hex releases to the wild with a skim of the owner's
// stores; a CAPITAL, held long enough, BREAKS THE NATION. Sacking never
// captures ground -- it is denial, and settle/conquest stay the capture verbs
// -- which is why a player at their dominion cap can still wage this war.
//
// UNOPPOSED is the whole clock: a battle at the hex pauses progress (the
// sacker is inBattle; never a reset, or a cheap suicide attack becomes a
// delay tactic), and killing or driving off the sacker ends it. The capital
// timer is therefore the relief window -- the reason your own country marches
// at double speed.

export function beginSack(army, who) {
  const owner = ownerOf(army.at);
  if (owner == null || owner === who.id) {
    // Nothing left to sack -- the ground changed hands or emptied mid-march.
    army.intent = null;
    army.sackTarget = null;
    return;
  }
  // THE SACK FIRES ONLY AT ITS TARGET (found live, 2026-08-26): a sack order
  // aimed at a hill frontier crossed the river kingdom's capital, won the
  // meeting engagement, and the standing intent sacked what it stood on --
  // breaking a nation the player never aimed at. Meeting engagements decide
  // where you FIGHT; a targeted order decides what you TEAR DOWN. An army
  // that wins short of its target stands and awaits orders, the same
  // affirmative-second-wave rule as everything else.
  if (army.sackTarget != null && army.at !== army.sackTarget) return;
  if (army.sackTarget == null) army.sackTarget = army.at;   // begun in place
  if (!army.sacking || army.sacking.hex !== army.at) {
    army.sacking = { hex: army.at, t: 0 };
    if (who.id === S.me) {
      chronicle(`The sack of ${placeWord(army.at)} begins. Hold the ground, and it will not be theirs much longer.`, "bad");
    } else if (owner === S.me) {
      chronicle(`They have begun tearing ${placeWord(army.at)} apart! Drive them off before it is lost.`, "bad");
    }
  }
}

function sackDuration(hexId, victim) {
  const place = world && world.places[hexId];
  const capital = place && (place.adversary === victim.key || (victim.id === S.me && hexId === world.home));
  return capital ? CONFIG.sackCapitalSeconds : CONFIG.sackSeconds;
}

// The nation ends. Their ground dissolves to wilderness, their columns
// scatter, their raids and clocks stop, and the sacker walks off with the
// treasury's share. `broken` is a persisted fact every system checks.
function breakNation(victim, sacker, hexId) {
  victim.broken = true;
  for (const id of holdings(victim.id)) releaseTile(id);
  for (const a of armiesOf(victim).slice()) {
    const list = armiesOf(victim);
    list.splice(list.indexOf(a), 1);
  }
  for (const r in victim.res) {
    const take = Math.floor((victim.res[r] || 0) * CONFIG.sackCapitalLootFrac);
    victim.res[r] -= take;
    sacker.res[r] = (sacker.res[r] || 0) + take;
  }
  if (victim.id === S.me) {
    // The military loss condition arrives with the verb: YOUR capital, sacked.
    runEnded("sacked");
    return;
  }
  if (sacker.id === S.me) {
    const adv = active().adversaries.find((x) => x.id === victim.key);
    const name = adv ? adv.name.charAt(0).toUpperCase() + adv.name.slice(1) : "The enemy";
    chronicle(`${name} are BROKEN. Their capital burns, their people scatter, and their story on this board is over.`, "good");
  }
}

export function tickSacks(dt) {
  for (const p of S.players || []) {
    for (const army of armiesOf(p)) {
      if (!army.sacking) continue;
      // The clock runs only while the sacker stands there, unengaged.
      if (army.inBattle || army.at !== army.sacking.hex) continue;
      const owner = ownerOf(army.at);
      if (owner == null || owner === p.id) { army.sacking = null; army.intent = null; continue; }
      const victim = playerById(owner);
      if (!victim) { army.sacking = null; continue; }
      army.sacking.t += dt;
      if (army.sacking.t < sackDuration(army.at, victim)) continue;
      // Done. A capital breaks the nation; ordinary ground releases and pays.
      const place = world.places[army.at];
      const isCapital = place && (place.adversary === victim.key || (victim.id === S.me && army.at === world.home));
      army.sacking = null;
      army.intent = null;
      army.sackTarget = null;
      if (isCapital) { breakNation(victim, p, army.at); continue; }
      releaseTile(army.at);
      for (const r in victim.res) {
        const take = Math.floor((victim.res[r] || 0) * CONFIG.sackLootFrac);
        victim.res[r] -= take;
        p.res[r] = (p.res[r] || 0) + take;
      }
      ensurePop(); syncPopMirror(); syncCharted();
      if (p.id === S.me) {
        chronicle(`${placeWord(army.at)} is sacked — the ground returns to the wild, and their stores ride home with your soldiers.`, "good");
      } else if (owner === S.me) {
        chronicle(`${placeWord(army.at)} is lost — sacked to the ground.`, "bad");
      }
    }
  }
}

// ---- The hooks marching runs under -----------------------------------------
// armies.js knows how to walk; it does not know what a battle is. These hooks
// are the one seam between them, and they point in one direction only --
// contact imports armies, never the reverse.

const HOOKS = {
  // A CONTESTED HEX IS LOCKED. An army whose next step is a battle parks where
  // it stands and its order dies -- the second wave is a new order, aimed at a
  // board the player looked at after watching how the first one went.
  barred: (hexId) => !!battleAt(hexId),
  parked: (army, who, hexId) => {
    if (who.id === S.me) {
      chronicle(`Your army halts before ${placeWord(hexId)} — a battle already rages there. They await orders.`);
    }
  },
  // STEPPING ONTO AN ENEMY SEALS A BATTLE, transit or destination alike. The
  // mover is the attacker: they walked in.
  entered: (army, who, hexId) => {
    for (const other of S.players) {
      if (other.id === who.id) continue;
      const standing = armyAt(hexId, other);
      if (standing && !standing.inBattle) {
        sealBattle(hexId, army, who, standing, other);
        return "halt";
      }
    }
    return null;
  },
  // ARRIVING ON ENEMY GROUND. Walls with nobody behind them still have to be
  // broken (a siege seals against masonry alone -- walls are a timer); bare
  // enemy ground simply falls, no dice and no ceremony, because population
  // does not fight. Arriving on UNOWNED ground claims nothing: settling is a
  // different verb with a different price.
  arrived: (army, who) => {
    const owner = ownerOf(army.at);
    if (owner == null || owner === who.id) return;
    const defP = playerById(owner);
    if (!defP) return;
    const { walls } = wallsAt(army.at, owner);
    // RAIDERS RAID; ARMIES CONQUER. A war party that reaches undefended
    // ground pillages it and turns for home; one that finds walls thinks
    // better of it -- raiders do not besiege, so walls win by standing there.
    // Ground only changes hands when a real army takes it.
    if (army.intent === "raid") {
      if (walls > 0) repelledByWalls(army, who, army.at);
      else pillageAt(army, who, army.at);
      return;
    }
    if (walls > 0) { sealBattle(army.at, army, who, null, defP); return; }
    // A SACK ORDER begins the moment the army stands unopposed on the target.
    if (army.intent === "sack") { beginSack(army, who); return; }
    conquer(army.at, who, defP);
  },
};

// The one tick the world calls: every civilization marches under the contact
// rules, then every battle plays its due rounds. Symmetric by construction.
export function tickMilitary(dt) {
  for (const p of S.players || []) marchArmies(dt, p, HOOKS);
  tickBattles(dt);
  tickSacks(dt);
  // Sighting notifications for every hostile column, and shepherding for
  // raiders whose orders ran out (survivors head home; the homebound
  // disperse). After battles, so a fight's survivors are swept the same tick.
  tickRaiders();
}
