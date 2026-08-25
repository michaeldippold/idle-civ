import { active } from "../content/compile.js";
import { rng } from "../core/rng.js";
import { CONFIG } from "../core/config.js";
import { availableUnits } from "../core/derived.js";
import { save } from "../core/persist.js";
import { atDominionCap, captureTile, marchFactor, routeCost, seatOf, syncPopMirror, world } from "../map/map.js";
import { S } from "../core/state.js";
import { record } from "../core/journal.js";
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
// The muster gate is an UPGRADE from 2026-08-25 (the War Camp and the Muster
// Ground were cap-1 buildings whose only effect was a permanent unlock, which
// is a tech). The name is kept -- what changed is the shelf it sits on.
export function musterBuilt() {
  const m = musterSpec();
  return !!m && !!S.upgrades[m.upgrade];
}
// A flat cap on column size lived here from 2026-08-24 to 2026-08-25 and was
// the wrong lever (owner, from play): "I had 4 of each type, but I can only
// send 4 total." It made units you had already paid population for unusable,
// and it flattened the mixed-column decision the whole counter system exists
// to create -- with four slots you send four of whatever counters them and
// leave the rest at home forever.
//
// It was also redundant twice over. `levyCap()` already sizes your army by
// TERRITORY (owned hexes x armyPerHex), so a Bronze dominion of 12 fields
// fewer than an Iron one of 20 without anyone deciding it should. And the
// walls are thinner while a column is away, so keeping fighters home already
// costs you something. What was missing was a price for bringing everyone,
// which is now what provisions are.
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

// WHO is raiding you -- the name the Chronicle prints when a raid lands.
//
// This answers a DIFFERENT question from riskAdversary() above, and conflating
// them is the trap. riskAdversary() asks who has a grudge big enough to prowl
// the roads (standing <= -2); it gates caravan escorts and multiplies the raid
// trigger, and it is null on a peaceful map. Attribution asks whose banners
// the raiders carry, which is a question every raid has an answer to.
//
// It keys off `contact`, the era-fact that already distinguishes "there is
// nobody who could send an army" from "there is" -- so the beat costs no new
// era-fact at all. At Stone the danger is real and ANONYMOUS: a warband out of
// the dark, belonging to no one on your map, because nobody in a stone age can
// raise a column. From Bronze it has a name and an address, and it is the same
// people every age -- the hill camps become the Hill People become the Hill
// Clans, and it was them the whole time.
//
// Returns null when nobody could plausibly be blamed, which is a real state
// and not a failure: the caller falls back to the anonymous voice.
export function raidAttribution() {
  if (active().contact === "none") return null;
  const pool = [];
  let total = 0;
  for (const a of active().adversaries) {
    // Peaceful neighbours do not raid you. If they ever should, that is a
    // disposition change with its own fiction, not a quiet exception here.
    if (a.disposition !== "warlike") continue;
    if (!S.adversaries[a.id]) continue;
    // A grudge does not decide WHETHER a warlike neighbour raids -- the
    // trigger roll upstream already did that, and hostilityMultiplier()
    // already made anger raise the rate. It decides how likely it is to be
    // THEM: neutral weighs 1, the angriest possible neighbour weighs 6.
    const w = 1 + Math.max(0, -(S.adversaries[a.id].standing || 0));
    pool.push([a, w]);
    total += w;
  }
  if (!pool.length) return null;
  // One candidate is the common case (the roster ships exactly one warlike
  // people). Returning it without a draw keeps the dice stream untouched --
  // an rng() call that cannot change an outcome should never be spent.
  if (pool.length === 1) return pool[0][0];
  let roll = rng() * total;
  for (const [a, w] of pool) { if (roll < w) return a; roll -= w; }
  return pool[pool.length - 1][0];
}

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
    // Provisions cannot be known until the column is mustered -- they scale
    // with who goes. The plan carries the RATES; provisionsFor() does the sum.
    provisionBase: CONFIG.campaignFoodBase * factor,
    provisionPerUnit: CONFIG.campaignFoodPerUnit * factor,
    tilesOff: targetTile && Number.isFinite(routeCost(targetTile)) ? Math.round(routeCost(targetTile)) : null,
  };
}

// What a column of `n` eats on this route. Distance multiplies both halves,
// which is the supply-line rule doing its usual work: a long march with a big
// army is the most expensive thing an era can attempt, and it should be.
export function provisionsFor(plan, n) {
  if (!plan) return 0;
  return Math.round(plan.provisionBase + plan.provisionPerUnit * Math.max(0, n));
}

// WHY A COLUMN CANNOT MARCH, in words, or null if it can.
//
// launchCampaign() has always had these guards; what it did not have was a way
// to SAY them, so pressing March with an empty muster did nothing at all and
// the player was left to guess. That is the third time the same shape of bug
// has been found in play -- a verb that refuses in silence -- after Settle and
// Build. The refusal reason lives with the guards it mirrors so the two cannot
// drift: anything added below should be added here.
export function campaignRefusal(ref, unitCounts) {
  if (S.dead) return "Your people are gone.";
  if (!musterBuilt()) return "You have nowhere to muster a column. Raise the muster ground first.";
  if (expeditionOut("campaign")) return "A campaign is already in the field.";
  if (typeof ref === "string" && ref.startsWith("tile:") && atDominionCap()) {
    return "Victory would win ground this age cannot govern — the dominion is at its full scope.";
  }
  const plan = campaignPlan(ref);
  if (!plan) return "There is no one there to march on.";
  const total = Object.values(unitCounts || {}).reduce((a, b) => a + b, 0);
  if (total < 1) return "Muster at least one fighter.";
  if (!validUnitCounts(unitCounts)) return "You cannot send fighters you do not have.";
  const provisions = provisionsFor(plan, total);
  if (S.res.food < provisions) {
    return `Short ${Math.ceil(provisions - S.res.food)} food — a column eats on the road, and this one cannot be fed that far.`;
  }
  return null;
}

export function launchCampaign(advId, unitCounts) {
  // A campaign that would END in a new holding answers to the era's scope
  // (dominionCap) -- you cannot subdue what the age cannot hold. Campaigns
  // against MAJORS are plunder, not conquest, and stay ungated.
  if (typeof arguments[0] === "string" && arguments[0].startsWith("tile:") && atDominionCap()) return;
  if (S.dead || expeditionOut("campaign") || !musterBuilt()) return;
  const plan = campaignPlan(advId);
  if (!plan) return;
  const total = Object.values(unitCounts).reduce((a, b) => a + b, 0);
  if (total < 1 || !validUnitCounts(unitCounts)) return;
  // You march on what you can feed. This is the only limit on column size
  // there is now, and it is the honest one.
  const provisions = provisionsFor(plan, total);
  if (S.res.food < provisions) return;
  S.res.food -= provisions;
  S.expeditions.push({ uid: ++S.buildSeq, type: "campaign", adversary: plan.target.ref,
    units: Object.assign({}, unitCounts), total: plan.time, remaining: plan.time });
  record("campaign", { target: plan.target.ref, units: Object.assign({}, unitCounts) }, S.tick);
  // The word follows the SIZE of the thing that actually left, not an era
  // fact: a handful of spears is a war party in any age, and twenty is a
  // column even in Bronze if you can feed them that far.
  const band = total <= 5 ? "A war party of" : "A column of";
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
  record("caravan", { target: advId, escort: guards > 0 ? Object.assign({}, escort) : null }, S.tick);
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

