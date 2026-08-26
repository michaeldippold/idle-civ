import { CONFIG } from "../core/config.js";

// ---------- THE BATTLE RESOLVER -----------------------------
// A roll-off in the Axis & Allies / TI4 idiom, and the replacement for the one
// line that used to be all of combat:
//
//     const repelChance = defense / (defense + raidSize);
//
// That line was an idle game's simplification -- one number for an army, one
// coin flip for a war. What follows is the owner's ruling of 2026-08-26, and
// every rule in it is written down in todo.md under the combat note.
//
// THE SHAPE. Units contribute dice. A die hits on its unit's number or better,
// HIGH IS GOOD, on a d10 -- a d6 gives five usable tiers and we have twelve
// ages to cross. Both sides roll from their PRE-ROUND rosters and casualties
// land after, so a dying unit still shoots. Rounds repeat until a side is gone
// or withdraws.
//
// WHAT THIS MODULE IS NOT. It touches no state, no DOM, and no global RNG: the
// caller passes the dice in. That is deliberate -- a battle must be resolvable
// in a harness with pinned dice, and the panel is a REPLAY of the script this
// returns rather than a second implementation of the rules. There is exactly
// one place the outcome of a fight is decided, and this is it.
//
// POWER SCALES THROUGH DICE COUNT, not through the to-hit number. A stronger
// unit rolls two dice at 7+, never one die at an impossible number, so every
// figure on the panel stays legible across the whole span. Extra dice are a
// tech-tree lever.

export const DIE = 10;   // d10, high is good

// The withdrawal stance, set when the group is dispatched and frozen the moment
// the battle seals. NAMED STEPS, never a number the player types: it is a RISK
// BUDGET ("I will spend up to half this army on this"), not a tactical brain.
// It reads only your OWN losses and deliberately does not know whether you are
// winning -- anything cleverer is the game playing itself, and the player did
// not ask for a second opinion from it.
//
// The known flaw is that you can withdraw at half with the enemy one round from
// breaking. It is kept on purpose: it is the same coin as the improbable win,
// and a cautious retreat from a near-victory is the game telling you your
// budget was too tight, which you can fix next time.
export const STANCES = [
  { id: "quarter",       name: "Withdraw at a quarter lost", loss: 0.25 },
  { id: "half",          name: "Withdraw at half lost",      loss: 0.50 },
  { id: "threeQuarters", name: "Withdraw at three quarters", loss: 0.75 },
  { id: "never",         name: "Fight to the last",          loss: Infinity },
];
// Fight-to-the-last is the DEFAULT because it is the least surprising: it does
// what the word "attack" means. An army that quietly withdrew from a battle the
// player thought they were winning is confusing, and confusing is worse than bad.
export const DEFAULT_STANCE = "never";
export function stanceById(id) {
  return STANCES.find((s) => s.id === id) || STANCES.find((s) => s.id === DEFAULT_STANCE);
}

// ---- Unit reads, all defaulted so a unit def missing a field still fights ----
export function unitDice(def) { return Math.max(0, def.dice == null ? 1 : def.dice); }
export function unitHit(def) { return Math.min(DIE, Math.max(1, def.hit || 7)); }
export function unitRole(def) { return def.role || "melee"; }
// How much of a wall one hit takes down. Melee and archers CAN bring a wall
// down, slowly, because siege engines do not exist until Iron and a Bronze fort
// has to be takeable. Siege engines are simply much better at it, which is what
// makes bringing them transformative rather than merely nice.
export function unitWallDamage(def) {
  return Math.max(0, def.wallDamage == null ? 1 : def.wallDamage);
}
export function hitChance(def) { return (DIE - unitHit(def) + 1) / DIE; }
export function expectedHits(def) { return unitDice(def) * hitChance(def); }

// WORST GOES FIRST, and worst means CHEAPEST. Cost, not combat value: ordering
// by combat value would kill an attacker's siege engines while the walls still
// stand -- exactly the units doing the work -- because their value against
// UNITS is deliberately awful. Cheapest-first is also what an Axis & Allies
// table does without being told to.
//
// (First pass: a raw sum of the build cost, which treats a bronze ingot and a
// log as worth the same. A scarcity weighting would be better and wants prices
// we do not have yet.)
export function unitCost(def) {
  let c = 0;
  const base = def.base || {};
  for (const k in base) c += base[k] || 0;
  return c;
}
export function casualtyOrder(roster) {
  return roster.map((s) => s.def).sort((a, b) =>
    unitCost(a) - unitCost(b) ||
    expectedHits(a) - expectedHits(b) ||
    (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)).map((d) => d.id);
}

function cloneRoster(roster) {
  return (roster || []).filter((s) => s && s.def && s.n > 0).map((s) => ({ def: s.def, n: s.n }));
}
function headcount(roster) { return roster.reduce((n, s) => n + s.n, 0); }

// One side's dice for one round. `behindWalls` is the fortification rule:
// ONLY ARCHERS FIRE FROM INSIDE. Melee stand there and hope the walls hold --
// and they are not free hit points either, since the attacker's hits are going
// into masonry, so they do nothing at all until the breach and then all of them
// wake at once. They are the reserve, and they are why storming a breach is
// terrifying.
//
// The FACES are kept, not just the totals: the panel has to show the player
// exactly why they lost, and it cannot do that from a sum.
function rollSide(roster, rng, behindWalls) {
  const stacks = [];
  let hits = 0, wall = 0;
  for (const s of roster) {
    if (s.n <= 0) continue;
    if (behindWalls && unitRole(s.def) !== "ranged") {
      stacks.push({ id: s.def.id, n: s.n, hit: unitHit(s.def), faces: [], hits: 0, silent: true });
      continue;
    }
    const faces = [];
    let stackHits = 0;
    const n = s.n * unitDice(s.def);
    for (let i = 0; i < n; i++) {
      const face = 1 + Math.floor(rng() * DIE);
      faces.push(face);
      if (face >= unitHit(s.def)) stackHits++;
    }
    hits += stackHits;
    wall += stackHits * unitWallDamage(s.def);
    stacks.push({ id: s.def.id, n: s.n, hit: unitHit(s.def), faces, hits: stackHits, silent: false });
  }
  return { stacks, hits, wall };
}

function applyCasualties(roster, hits, order) {
  let left = hits;
  const lost = [];
  for (const id of order) {
    if (left <= 0) break;
    const stack = roster.find((s) => s.def.id === id);
    if (!stack || stack.n <= 0) continue;
    const k = Math.min(stack.n, left);
    stack.n -= k; left -= k;
    lost.push({ id, n: k });
  }
  return lost;
}

// ---- The resolution --------------------------------------------------------
// spec: {
//   attacker: { pid, roster: [{def, n}], stance },
//   defender: { pid, roster: [{def, n}], stance },
//   walls, rng
// }
//
// Resolved to completion in ONE call. What plays out over ticks is the SCRIPT
// this returns -- the sim knows the ending immediately, the world does not see
// it until the last round has ticked through, and the panel can therefore be
// closed, reopened at the live round, or re-watched without ever desyncing from
// the result.
//
// A BATTLE IS SEALED WHEN IT JOINS. There is no way to add a unit to a fight in
// progress, because there is no argument for it: reinforcement mid-battle is
// drip-feeding, and drip-feeding is micro. Relief does not join a siege, it
// fights the winner.
export function resolveBattle(spec) {
  const rng = spec.rng;
  const atk = cloneRoster(spec.attacker && spec.attacker.roster);
  const def = cloneRoster(spec.defender && spec.defender.roster);
  let walls = Math.max(0, spec.walls || 0);

  const atkOrder = casualtyOrder(atk), defOrder = casualtyOrder(def);
  const atkStart = headcount(atk), defStart = headcount(def);
  const wallsStart = walls;
  const atkStance = stanceById(spec.attacker && spec.attacker.stance);
  const defStance = stanceById(spec.defender && spec.defender.stance);

  // POPULATION DOES NOT FIGHT -- it is the prize, not a participant. They are
  // scared and hiding. An undefended hex with no walls falls with no dice and
  // no panel: one Chronicle line, and the caller checks for this outcome and
  // skips the show. If population fought, every hex would be a battle and
  // armies would be pointless.
  if (defStart <= 0 && walls <= 0) {
    return {
      rounds: [], outcome: "undefended", holder: "attacker", walls: 0, wallsStart,
      attacker: atk, defender: def, atkStart, defStart, breachedAt: null,
    };
  }

  const rounds = [];
  let outcome = null, breachedAt = null;

  for (let r = 1; r <= CONFIG.battleMaxRounds; r++) {
    const behindWalls = walls > 0;
    // SIMULTANEOUS. Both sides roll off the pre-round rosters, so a unit that
    // dies this round still fired this round. That is the whole reason one
    // infantry can kill six tanks.
    const aRoll = rollSide(atk, rng, false);
    const dRoll = rollSide(def, rng, behindWalls);

    let defLost = [], breached = false;
    const wallsBefore = walls;
    if (behindWalls) {
      // WHILE WALLS STAND THE ATTACKER'S HITS GO TO THE WALLS, not the
      // garrison. No spill: hits that bring a wall down do not carry through to
      // the defenders in the same round. The breach is the NEXT round's drama,
      // and it is the beat the panel exists for -- every greyed-out melee row on
      // both sides lighting up at once.
      walls = Math.max(0, walls - aRoll.wall);
      breached = walls === 0;
      if (breached) breachedAt = r;
    } else {
      defLost = applyCasualties(def, aRoll.hits, defOrder);
    }
    const atkLost = applyCasualties(atk, dRoll.hits, atkOrder);

    rounds.push({
      n: r, behindWalls, breached,
      wallsBefore, wallsAfter: walls,
      attacker: { roll: aRoll, lost: atkLost, left: headcount(atk) },
      defender: { roll: dRoll, lost: defLost, left: headcount(def) },
    });

    const aLeft = headcount(atk), dLeft = headcount(def);
    if (aLeft <= 0 && dLeft <= 0) { outcome = "mutual"; break; }
    if (aLeft <= 0) { outcome = "attackerWiped"; break; }
    // Walls with no one behind them are a TIMER, not a defence: an empty
    // fortification still has to be broken, and that time is what a relief
    // force races. So the hex does not fall until the masonry is down.
    if (dLeft <= 0 && walls <= 0) { outcome = "defenderWiped"; break; }

    // THE WITHDRAWAL CHECK, end of round and never before round one is done --
    // a freak opening round may not rout an army instantly. If both sides would
    // withdraw in the same round the ATTACKER'S resolves first: they are the
    // ones who chose to be there and can simply stop, and the defender holds
    // ground they were already standing on.
    if (atkStart > 0 && (atkStart - aLeft) / atkStart >= atkStance.loss) {
      outcome = "attackerWithdrew"; break;
    }
    if (defStart > 0 && (defStart - dLeft) / defStart >= defStance.loss) {
      outcome = "defenderWithdrew"; break;
    }
  }
  // The cap is a runaway guard, not a rule. A battle cannot actually stall --
  // every attacker always rolls, so walls always come down and someone always
  // dies -- and the harness asserts it is never reached in ordinary play.
  if (!outcome) outcome = "stalemate";

  const holder =
    outcome === "defenderWiped" || outcome === "defenderWithdrew" || outcome === "undefended"
      ? "attacker" : "defender";

  return {
    rounds, outcome, holder, walls, wallsStart,
    attacker: atk, defender: def, atkStart, defStart, breachedAt,
  };
}
