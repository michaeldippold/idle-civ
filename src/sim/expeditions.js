import { active } from "../content/compile.js";
import { rng } from "../core/rng.js";
import { CONFIG } from "../core/config.js";
import { availableUnits } from "../core/derived.js";
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
// in the Chronicle. Resolution lines log even under SIM, same rule as
// migration narrates: rare and story-critical, they belong in the record
// even if they happened while you were away.
export function findAdversary(id) { return active().adversaries.find((a) => a.id === id); }
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

export function launchCampaign(advId, unitCounts) {
  if (S.dead || expeditionOut("campaign") || (S.builds.musterGround || 0) < 1) return;
  const adv = findAdversary(advId);
  if (!adv) return;
  const total = Object.values(unitCounts).reduce((a, b) => a + b, 0);
  if (total < 1 || !validUnitCounts(unitCounts)) return;
  if (S.res.food < CONFIG.campaignFoodCost) return;
  S.res.food -= CONFIG.campaignFoodCost;
  S.expeditions.push({ uid: ++S.buildSeq, type: "campaign", adversary: advId,
    units: Object.assign({}, unitCounts), total: adv.campaignTime, remaining: adv.campaignTime });
  log(`A column of ${total} marches against ${adv.name}. The walls are thinner until they return.`);
  renderAll();
}

// `escort` is optional: units riding with the cargo. Escorts don't lower the
// odds of an ambush -- they decide how one ENDS (see resolveCaravan).
export function launchCaravan(advId, escort) {
  if (S.dead || expeditionOut("caravan") || (S.builds.musterGround || 0) < 1) return;
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
      S.pop -= 1;
      const def = active().units.find((u) => u.id === uid);
      return def ? def.name : uid;
    }
    roll -= w;
  }
  return null;
}
export function totalDeployed(ex) { return Object.values(ex.units || {}).reduce((a, b) => a + b, 0); }

export function resolveCampaign(ex, adv, st) {
  bumpStanding(st, -1);   // plunder is not diplomacy, win or lose -- or repelled at the walls

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
    const adv = findAdversary(ex.adversary);
    const st = S.adversaries[ex.adversary];
    if (!adv || !st) continue;
    if (ex.type === "campaign") resolveCampaign(ex, adv, st);
    else resolveCaravan(ex, adv, st);
  }
}

