import { buildCost, canAfford, civilians, defById, isCapped, levyCap, levyUsed, pendingCount, playtime, reserved } from "./derived.js";
import { active } from "../content/compile.js";
import { CONFIG } from "./config.js";
import { marchFactor, routeCost, world, captureTile, syncPopMirror } from "../map/map.js";
import { S } from "./state.js";
import { save } from "./persist.js";
import { advanceEra } from "../sim/era.js";
import { fmtTime, renderAll } from "../ui/chrome.js";
import { log } from "../ui/log.js";

// ---------- Actions -----------------------------------------
// assign() -- the stepper verb -- died here in E2. Allocation lives on the
// map: click a hex, set what its people work.

export function build(def) {
  if (S.dead) return;
  if (def.kind === "upgrade" && (S.upgrades[def.id] || pendingCount(def.id) > 0)) return;
  if (isCapped(def)) return;
  const cost = buildCost(def);
  if (!canAfford(cost)) return;
  if (def.kind === "unit") {
    // One training rule in every era (E5): the army is capped by the LAND
    // (hexes x armyPerHex), and the recruit is a real person with a home.
    if (levyUsed() + 1 > levyCap()) return;
    if (def.popCost && civilians() - reserved() < def.popCost) return;
  } else if (def.popCost && civilians() - reserved() < def.popCost) return;
  for (const k in cost) S.res[k] -= cost[k];
  const wasEmpty = S.buildQueue.length === 0;
  S.buildQueue.push({ id: def.id, kind: def.kind, uid: ++S.buildSeq, total: def.buildTime, remaining: def.buildTime, cost });
  // Pacing telemetry (console only): stamp the game clock when age research
  // starts, so playtest timing doesn't require watching the clock.
  if (CAPSTONES[def.id]) console.log(`[pacing] ${def.name} research started at ${fmtTime(playtime())} (t${S.tick})`);
  if (def.kind === "upgrade") {
    log(wasEmpty ? `Work begins on ${def.name}.` : `${def.name} joins the queue (#${S.buildQueue.length}).`);
  } else if (def.kind === "unit") {
    log(wasEmpty ? `${def.name} training begins.` : `${def.name} training joins the queue (#${S.buildQueue.length}).`);
  } else {
    log(wasEmpty ? `Ground is broken for a ${def.name}.` : `A ${def.name} joins the queue (#${S.buildQueue.length}).`);
  }
  save();
  renderAll();
}

// Cancel anything in the queue -- including the item currently building --
// for a full refund of what was actually paid for it. Population reserved by
// a cancelled unit order is automatically freed, since idle()/reserved() are
// derived live from S.buildQueue rather than tracked separately.
// Removes a queue entry and hands its materials back. Shared by the player's
// cancel button and by the workforce reconciler, which has to abandon orders
// whose worker died.
export function dropQueueItem(idx) {
  const item = S.buildQueue[idx];
  if (!item) return null;
  for (const k in item.cost) S.res[k] = (S.res[k] || 0) + item.cost[k];
  S.buildQueue.splice(idx, 1);
  return item;
}

export function cancelBuild(uid) {
  if (S.dead) return;
  const idx = S.buildQueue.findIndex((q) => q.uid === uid);
  if (idx === -1) return;
  const item = dropQueueItem(idx);
  if (CAPSTONES[item.id]) console.log(`[pacing] ${defById(item.id).name} research cancelled at ${fmtTime(playtime())} (t${S.tick})`);
  log(`Construction of the ${defById(item.id).name} is called off; materials recovered.`);
  save();
  renderAll();
}

// The settle verb (6d, user ruling): claiming wilderness is QUEUED WORK --
// "establishing a minor lord" goes through the Underway queue with a real
// cost and a real timer, both scaled by the route. The queue's seriality is
// the standing anti-speedrun governor: you cannot click a continent into
// existence. Cancel refunds exactly what was paid, like any build.
export function settlePlan(tileId) {
  if (!world || !world.places[tileId]) return null;
  const p = world.places[tileId];
  if (p.terrain === "water" || p.adversary || p.minor) return null;
  if (S.map.owned.includes(tileId)) return null;
  const factor = marchFactor(tileId);
  // The claim's price is an era-fact (E3): Stone pays food and time only --
  // the first claim must be affordable before wood exists -- and later eras
  // price in their own materials. The route scales everything, as always.
  const spec = (active().map && active().map.claim) || { cost: { food: 40, wood: 25 }, time: 45 };
  // Escalation (E4, from the owner's first playtest: settling was trivial):
  // each claim beyond the starting trio costs claimScale more than the last,
  // the same per-copy idiom buildings use. Distance still multiplies on top.
  const esc = Math.pow(CONFIG.claimScale, Math.max(0, S.map.owned.length - 3));
  const cost = {};
  for (const k in spec.cost) cost[k] = Math.round(spec.cost[k] * factor * esc);
  return {
    tile: tileId,
    cost,
    time: Math.round(spec.time * factor),
    tilesOff: Number.isFinite(routeCost(tileId)) ? Math.round(routeCost(tileId)) : null,
  };
}

export function pendingSettle(tileId) {
  return S.buildQueue.some((q) => q.kind === "settle" && q.tile === tileId);
}

export function launchSettle(tileId) {
  if (S.dead) return;   // every era allocates hexes since E2
  const plan = settlePlan(tileId);
  if (!plan || pendingSettle(tileId)) return;
  if (!canAfford(plan.cost)) return;
  for (const k in plan.cost) S.res[k] -= plan.cost[k];
  const terrain = world.places[tileId].terrain;
  S.buildQueue.push({ id: "settle", kind: "settle", uid: ++S.buildSeq,
    total: plan.time, remaining: plan.time, cost: plan.cost,
    tile: tileId, label: `Settling the ${terrain}` });
  log(`A party sets out to raise a holdfast on the ${terrain}. (#${S.buildQueue.length} in the queue.)`);
  save();
  renderAll();
}

export function completeConstruction(site) {
  if (site.kind === "settle") {
    // The land may have been lost or taken while the party was queued;
    // captureTile refuses gracefully and the work is simply wasted -- the
    // frontier is like that.
    const ok = captureTile(site.tile, true);
    if (ok) log(`A hall is raised and a lord installed — the ${world && world.places[site.tile] ? world.places[site.tile].terrain : "land"} is yours. One more holdfast under your banner.`, "big");
    else log("The settling party finds the ground already spoken for, and turns back.", "bad");
    return;
  }
  const def = defById(site.id);
  if (def.kind === "upgrade") S.upgrades[def.id] = true;
  else if (def.kind === "unit") {
    // The recruit is drawn from the SEAT (owner ruling: no source
    // micromanagement -- the capital musters). If the seat is empty, the
    // largest holding sends its own; the person is real either way.
    if (def.popCost && S.map && S.map.pop && world) {
      let from = (S.map.pop[world.home] || 0) >= def.popCost ? world.home : null;
      if (!from) {
        let best = 0;
        for (const id of S.map.owned) {
          if ((S.map.pop[id] || 0) > best) { best = S.map.pop[id]; from = id; }
        }
      }
      if (from) S.map.pop[from] = Math.max(0, S.map.pop[from] - def.popCost);
      syncPopMirror();
    }
    S.units[def.id] = (S.units[def.id] || 0) + 1;
  }
  else S.builds[def.id] = (S.builds[def.id] || 0) + 1;
  onComplete(def);
}

// Which upgrade ids are age capstones, and where each one leads. The only
// per-capstone wiring an age transition needs.
export const CAPSTONES = { bronzeAge: "bronze", ironAge: "iron" };

export function onComplete(def) {
  if (CAPSTONES[def.id]) { advanceEra(CAPSTONES[def.id]); return; }

  if (def.id === "hut") {
    // (the hut housing announcement died in E3 with the hut)
    if (n === 3) log("A cluster of rooftops — this is becoming a real place.", "big");
  } else if (def.kind === "unit") {
    log(`A settler trains as a ${def.name}. You now field ${S.units[def.id]}.`, "good");
  } else {
    log(`${def.name} complete. ${def.desc}`, "good");
  }
}

// The one and only place S.era is ever assigned. S.era is nothing more than
// the key into MANIFESTS -- every read of content goes through active() -- so
// flipping it swaps the entire world in one assignment. Everything else here
// is the transition machinery around that assignment, in a deliberate order:
//
//   1. Capture `before` values and the frozen SNAPSHOT while the old manifest
//      is still active. The snapshot is archived in S.eraHistory[fromEra]
//      (kept for every era, forever -- it's a few hundred bytes and it's the
//      raw material for diagnosing or recovering a bad migration, the
//      project's first genuinely destructive state change).
//   2. Flip S.era.
//   3. Run migrations. Formulas read ONLY the snapshot and write ONLY live
//      state, so instruction order cannot matter by construction.
//   4. Purge DOM nodes for ids that didn't survive -- the one place content
//      is ever allowed to leave the screen ("nothing can un-reveal" holds
//      everywhere except an era boundary).
//   5. reconcileWorkforce(), in case released workers left the books odd.
//
// The full announcement lives in a modal; a single milestone line still goes
// to the Chronicle so the settlement's own record contains the moment.
