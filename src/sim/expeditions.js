import { active } from "../content/compile.js";
import { rng } from "../core/rng.js";
import { CONFIG } from "../core/config.js";
import { availableUnits } from "../core/derived.js";
import { save } from "../core/persist.js";
import { atDominionCap, captureTile, marchFactor, routeCost, seatOf, syncPopMirror, world } from "../map/map.js";
import { S } from "../core/state.js";
import { armorFactor, weaponMultiplier } from "./combat.js";
import { renderAll } from "../ui/chrome.js";
import { log } from "../ui/log.js";

// ---------- Adversaries & Expeditions -----------------------
// The era's outward verbs. The Muster Ground stages ONE CAMPAIGN and ONE
// CARAVAN at a time -- soldiers and merchants are different people, so the
// two tracks run in parallel, but never two of a kind: the split is still
// the decision on each track. Resolution happens in step() on the world's
// schedule, and there are NO catch windows -- outcomes self-apply and land
// in the Chronicle. Resolution lines always log, same rule as migration
// narrates: rare and story-critical, they belong in the record.
export function findAdversary(id) { return active().adversaries.find((a) => a.id === id); }

// ---------- What this age can muster --------------------------------
// The building a column gathers at is an ERA FACT, not a hard-coded id. It
// was `musterGround` everywhere until 2026-08-24, which was fine while Iron
// was the only age with an outward verb and became a lie the moment Bronze
// got one: the March button appeared and sat forever disabled behind a
// building three eras of content away.
export function musterSpec() { return active().muster || null; }
export function musterBuilt() {
  const m = musterSpec();
  return !!m && (S.builds[m.building] || 0) >= 1;
}
// How many fighters one column carries. null means no cap -- Iron musters
// columns; Bronze musters a war party of four. This IS the scaling of the
// age's outward verb, and the only one it needs.
export function columnCap() {
  const m = musterSpec();
  return m && m.column != null ? m.column : Infinity;
}
export function columnSize(unitCounts) {
  return Object.values(unitCounts || {}).reduce((a, b) => a + b, 0);
}
export function expeditionOut(type) { return S.expeditions.some((e) => e.type === type); }

export function standingWord(n) {
  return n <= -2 ? "Hostile" : n === -1 ? "Wary" : n >= 2 ? "Friendly" : "Neutral";
}
export function bumpStanding(st, delta) {
  st.standing = Math.max(-5, Math.min(5, st.standing + delta));
}

// Every Hostile WARLIKE neighbor multiplies the home conflict trigger --
// the one way an adversary reaches into the settlement uninvited.
export function hostilityMultiplier() {
  let mult = 1;
  for (const adv of active().adversaries) {
    const st = S.adversaries[adv.id];
    if (adv.disposition === "warlike" && st && st.standing <= -2) mult *= CONFIG.hostileConflictMult;
  }
  return mult;
}
// The strongest Hostile warlike neighbor -- whose war parties prowl the
// roads. Null when the roads are safe (caravans launch one-click then; the
// escort question only exists when there's someone to escort against).
export function riskAdversary() {
  let worst = null;
  for (const a of active().adversaries) {
    const st = S.adversaries[a.id];
    if (a.disposition !== "warlike" || !st || st.standing > -2) continue;
    if (!worst || a.strength > worst.strength) worst = a;
  }
  return worst;
}
export function hostileRouteRisk() { return !!riskAdversary(); }

// A campaign force's strength: the same math as home defense, pointed
// outward -- weapon tiers apply, and counters match against the adversary's
// fighting style instead of a rolled raid type.
export function campaignStrength(unitCounts, adv) {
  let attack = 0;
  for (const uid in unitCounts) {
    const def = active().units.find((u) => u.id === uid);
    if (!def) continue;
    const matched = def.counters === adv.fightsAs;
    attack += unitCounts[uid] * (def.strength || 1) * weaponMultiplier() * (matched ? CONFIG.counterBonus : 1);
  }
  return attack;
}

// What the column brings against stone: everyone can storm a wall (badly);
// units flagged `siege: true` hit it at CONFIG.siegeWallBonus times their
// strength. No counter bonuses -- walls have no fighting style.
export function wallPower(unitCounts) {
  let power = 0;
  for (const uid in unitCounts) {
    const def = active().units.find((u) => u.id === uid);
    if (!def) continue;
    power += unitCounts[uid] * (def.strength || 1) * weaponMultiplier() * (def.siege ? CONFIG.siegeWallBonus : 1);
  }
  return power;
}

// Shared allocation check for any expedition carrying units.
export function validUnitCounts(unitCounts) {
  for (const uid in unitCounts) {
    if (unitCounts[uid] < 0 || unitCounts[uid] > availableUnits(uid)) return false;
  }
  return true;
}

// A campaign target, unified (6d): a MAJOR is an adversary id; a MINOR is
// "tile:q,r". Majors keep standing and diplomacy; minors exist to be taken
// -- win one and the tile swears fealty, one more holdfast under your
// banner. Old saves' expeditions carry `adversary`; the resolver accepts it.
export function campaignTarget(ref) {
  if (typeof ref === "string" && ref.startsWith("tile:")) {
    const tid = ref.slice(5);
    const p = world && world.places[tid];
    const st = S.map && S.map.minors && S.map.minors[tid];
    if (!p || !p.minor || !st) return null;
    return {
      ref, kind: "minor", tile: tid, name: p.minor.name,
      strength: p.minor.strength, wallsMax: p.minor.wallsMax,
      fightsAs: "warband", st,
      baseTime: 60,
    };
  }
  const adv = findAdversary(ref);
  const st = S.adversaries[ref];
  if (!adv || !st) return null;
  return {
    ref, kind: "major", id: ref, name: adv.name,
    strength: adv.strength, wallsMax: adv.walls || 0,
    fightsAs: adv.fightsAs, st, adv,
    baseTime: adv.campaignTime,
  };
}

// The muster sheet's numbers, distance included: provisions and march time
// both scale with the route, and a route through your own country is cheap
// -- the supply-line rule made arithmetic.
export function campaignPlan(ref) {
  const t = campaignTarget(ref);
  if (!t) return null;
  const targetTile = t.kind === "minor" ? t.tile : (seatOf(t.ref) ? seatOf(t.ref).id : null);
  const factor = targetTile ? marchFactor(targetTile) : 1;
  return {
    target: t,
    time: Math.round(t.baseTime * factor),
    provisions: Math.round(CONFIG.campaignFoodCost * factor),
    tilesOff: targetTile && Number.isFinite(routeCost(targetTile)) ? Math.round(routeCost(targetTile)) : null,
  };
}

export function launchCampaign(advId, unitCounts) {
  // A campaign that would END in a new holding answers to the era's scope
  // (dominionCap) -- you cannot subdue what the age cannot hold. Campaigns
  // against MAJORS are plunder, not conquest, and stay ungated.
  if (typeof arguments[0] === "string" && arguments[0].startsWith("tile:") && atDominionCap()) return;
  if (S.dead || expeditionOut("campaign") || !musterBuilt()) return;
  // The age's column cap, enforced HERE and not only in the modal: the modal
  // is a convenience, this is the rule.
  if (columnSize(unitCounts) > columnCap()) return;
  const plan = campaignPlan(advId);
  if (!plan) return;
  const total = Object.values(unitCounts).reduce((a, b) => a + b, 0);
  if (total < 1 || !validUnitCounts(unitCounts)) return;
  if (S.res.food < plan.provisions) return;
  S.res.food -= plan.provisions;
  S.expeditions.push({ uid: ++S.buildSeq, type: "campaign", adversary: plan.target.ref,
    units: Object.assign({}, unitCounts), total: plan.time, remaining: plan.time });
  // An age that musters four does not send a COLUMN. The word follows the
  // era fact, so the Chronicle never promises an army you cannot raise.
  const band = Number.isFinite(columnCap()) ? "A war party of" : "A column of";
  log(`${band} ${total} marches against ${plan.target.name}. The walls are thinner until they return.`);
  save();
  renderAll();
}

// `escort` is optional: units riding with the cargo. Escorts don't lower the
// odds of an ambush -- they decide how one ENDS (see resolveCaravan).
export function launchCaravan(advId, escort) {
  if (S.dead || expeditionOut("caravan") || !musterBuilt()) return;
  const adv = findAdversary(advId);
  const st = S.adversaries[advId];
  if (!adv || !adv.buys || !st) return;
  if (st.standing <= -2) return;                       // they remember your raids
  if ((st.stock.gold || 0) <= 0) return;               // traded dry
  if ((S.res[adv.buys.res] || 0) < adv.buys.amount) return;
  if (escort && !validUnitCounts(escort)) return;
  const guards = escort ? Object.values(escort).reduce((a, b) => a + b, 0) : 0;
  S.res[adv.buys.res] -= adv.buys.amount;
  const ex = { uid: ++S.buildSeq, type: "caravan", adversary: advId,
    cargo: { res: adv.buys.res, amount: adv.buys.amount }, total: adv.caravanTime, remaining: adv.caravanTime };
  if (guards > 0) ex.units = Object.assign({}, escort);
  S.expeditions.push(ex);
  log(`A caravan sets out for ${adv.name}, laden with ${adv.buys.amount} ${adv.buys.res}${guards ? `, under guard of ${guards}` : ""}.`);
  save();
  renderAll();
}

// A campaign casualty: drawn from the DEPLOYED force (exposure-weighted, same
// weights as home casualties), removed from the column and the population.
export function removeDeployedUnit(ex) {
  const weightOf = (uid) => {
    const def = active().units.find((u) => u.id === uid);
    return (ex.units[uid] || 0) * ((def && def.casualtyWeight) || 1);
  };
  const ids = Object.keys(ex.units);
  const totalW = ids.reduce((s, uid) => s + weightOf(uid), 0);
  if (totalW <= 0) return null;
  let roll = rng() * totalW;
  for (const uid of ids) {
    const w = weightOf(uid);
    if (roll < w) {
      ex.units[uid] -= 1;
      S.units[uid] -= 1;
      // Same levy rule as removeRandomUnit: the holdfast survives its band.
      syncPopMirror();   // the mirror counts the army (E5)
      const def = active().units.find((u) => u.id === uid);
      return def ? def.name : uid;
    }
    roll -= w;
  }
  return null;
}
export function capMinor(name) { return name.charAt(0).toUpperCase() + name.slice(1); }
function totalDeployed(ex) { return Object.values(ex.units || {}).reduce((a, b) => a + b, 0); }

export function resolveCampaign(ex, target) {
  const adv = { name: target.name, strength: target.strength, walls: target.wallsMax, fightsAs: target.fightsAs };
  const st = target.st;
  if (target.kind === "major") bumpStanding(st, -1);   // plunder is not diplomacy; minors keep no ledger

  // THE BREACH PHASE: walls fall before any defender does. Damage persists in
  // the living remnant -- the scars your engines carve stay carved, and a
  // breached wall stays breached for the era. A failed breach is a retreat
  // with light losses: walls repel, they don't massacre.
  if ((st.walls || 0) > 0) {
    const power = wallPower(ex.units);
    const fresh = st.walls >= (adv.walls || 0);
    if (power < st.walls) {
      st.walls -= power;
      log(`The walls of ${adv.name} hold. Your column withdraws in good order — but its work is carved into the stone.`, "bad");
      if (rng() < CONFIG.wallRetreatLoss * armorFactor()) {
        const lost = removeDeployedUnit(ex);
        if (lost) log(`A ${lost} falls beneath the walls.`, "bad");
      }
      return;
    }
    st.walls = 0;
    log(fresh
      ? `The walls of ${adv.name} come down in a single furious assault.`
      : `The battered walls of ${adv.name} finally give way.`, "big");
  }

  const attack = campaignStrength(ex.units, adv);
  const winChance = attack / (attack + adv.strength);

  if (rng() < winChance) {
    if (target.kind === "minor") {
      // CAPTURE: the whole stock comes home, the tile swears fealty, and the
      // Chronicle records the name for the last time (design.md).
      const takes = [];
      for (const k in st.stock) {
        if (st.stock[k] > 0) { S.res[k] = (S.res[k] || 0) + st.stock[k]; takes.push(`${st.stock[k]} ${k}`); }
      }
      captureTile(target.tile, false);
      log(`${capMinor(target.name)} swears fealty to your banner — one more holdfast, and ${takes.length ? takes.join(", ") : "little else"} besides. The Chronicle records the name for the last time.`, "big");
      if (rng() < (adv.strength / (attack + adv.strength)) * armorFactor()) {
        const lost = removeDeployedUnit(ex);
        if (lost) log(`The taking had a price — a ${lost} does not come home.`, "bad");
      }
      return;
    }
    const takes = [];
    for (const k in st.stock) {
      const take = Math.floor(st.stock[k] * CONFIG.plunderFraction);
      if (take > 0) { st.stock[k] -= take; S.res[k] = (S.res[k] || 0) + take; takes.push(`${take} ${k}`); }
    }
    log(`Victory over ${adv.name}. The column returns with ${takes.length ? takes.join(", ") : "little worth taking"}.`, "big");
    // Winning can still cost someone -- softened by armor, same dial as home.
    if (rng() < (adv.strength / (attack + adv.strength)) * armorFactor()) {
      const lost = removeDeployedUnit(ex);
      if (lost) log(`The victory had a price — a ${lost} does not come home.`, "bad");
    }
  } else {
    const losses = Math.min(totalDeployed(ex), 1 + Math.floor(adv.strength / 8));
    let fell = 0;
    for (let i = 0; i < losses; i++) if (removeDeployedUnit(ex)) fell++;
    log(`The campaign against ${adv.name} is broken. ${fell > 0 ? `${fell} of your fighters fall covering the retreat.` : "The column limps home."}`, "bad");
  }
}

export function resolveCaravan(ex, adv, st) {
  // Ambush: while a warlike neighbor is Hostile, their war parties prowl the
  // roads at a flat chance. Escorts don't lower the odds of being found --
  // they decide how the ambush ENDS: fight through and the trade completes.
  const raiders = riskAdversary();
  if (raiders && rng() < CONFIG.caravanRaidChance) {
    const escortStr = ex.units ? campaignStrength(ex.units, raiders) : 0;
    if (escortStr <= 0) {
      log(`Your caravan to ${adv.name} never arrives — ${raiders.name} took it on the road. The cargo is lost.`, "bad");
      return;
    }
    if (rng() < escortStr / (escortStr + raiders.strength)) {
      log(`${raiders.name} fall on your caravan — and the escort fights them through.`, "good");
      if (rng() < (raiders.strength / (escortStr + raiders.strength)) * armorFactor()) {
        const lost = removeDeployedUnit(ex);
        if (lost) log(`The road took its toll — a ${lost} does not come home.`, "bad");
      }
      // ...and the trade goes ahead below.
    } else {
      const lost = removeDeployedUnit(ex);
      log(`${raiders.name} overwhelm your caravan${lost ? ` — a ${lost} falls defending it` : ""}. The cargo is lost.`, "bad");
      return;
    }
  }

  const wary = st.standing < 0;   // read BEFORE the trade improves things
  const premium = st.standing >= 2 ? 1.25 : 1;
  const pays = Math.min(Math.floor(adv.buys.pays * premium), Math.floor(st.stock.gold || 0));
  st.stock.gold = (st.stock.gold || 0) - pays;
  // Sold goods JOIN their stock -- stocks are real, and what you sell them a
  // later campaign could take back. The game never mentions this.
  st.stock[ex.cargo.res] = (st.stock[ex.cargo.res] || 0) + ex.cargo.amount;
  S.res.gold = (S.res.gold || 0) + pays;
  bumpStanding(st, 1);
  if (pays <= 0) {
    log(`The caravan returns from ${adv.name} unpaid — they have no gold left to give.`, "bad");
  } else if (wary) {
    // The rep system, hinted through narration rather than printed as a number.
    log(`The caravan returns from ${adv.name} with ${pays} gold, counted out in silence under armed watch. They have not forgotten.`);
  } else {
    log(`The caravan returns from ${adv.name} with ${pays} gold.`, "good");
  }
}

// Ticks in step(). An expedition whose adversary no longer exists (the era
// flipped mid-flight) simply comes home: units were never removed from
// S.units, so removing the expedition entry IS their return.
export function resolveExpeditions(dt) {
  for (let i = S.expeditions.length - 1; i >= 0; i--) {
    const ex = S.expeditions[i];
    ex.remaining -= dt;
    if (ex.remaining > 0) continue;
    S.expeditions.splice(i, 1);
    if (ex.type === "campaign") {
      const target = campaignTarget(ex.adversary);   // ref: major id or "tile:q,r"
      if (target) resolveCampaign(ex, target);
      continue;
    }
    const adv = findAdversary(ex.adversary);
    const st = S.adversaries[ex.adversary];
    if (adv && st) resolveCaravan(ex, adv, st);
  }
}

