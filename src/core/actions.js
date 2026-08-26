import { buildCost, canAfford, caps, civilians, defById, fmtTime, isCapped, levyCap, levyUsed, pendingCount, playtime, reserved } from "./derived.js";
import { active } from "../content/compile.js";
import { CONFIG } from "./config.js";
import { atDominionCap, captureTile, hexUse, holdCount, holdings, isOwned, marchFactor, routeCost, setHexBuild, structureCount, structureDef, syncPopMirror, world } from "../map/map.js";
import { S, me } from "./state.js";
import { record } from "./journal.js";
import { save } from "./persist.js";
import { advanceEra } from "../sim/era.js";
import { chronicle, requestRender } from "../core/bus.js";

// ---------- Actions -----------------------------------------
// assign() -- the stepper verb -- died here in E2. Allocation lives on the
// map: click a hex, set what its people work.
//
// EVERY player verb lives in this file (or sim/expeditions.js) and nowhere
// else. The rule is not tidiness: a verb that exists only as a DOM click
// handler is a verb no bot can call, no journal can record and no peer can
// replay -- so the moment adversaries start using the player's own systems,
// it is the one move they cannot make.

// (setWork() lived here for exactly one day. It was built on 2026-08-25 to
// close the last hole in the action layer -- allocation was a DOM click
// handler -- and the hex economy landed the same evening and removed the
// choice it made. Terrain decides what a hex yields now. The discipline it
// was built for stands: every player verb below is callable with no UI in
// the room, validates on its own, and records itself in the journal.)

export function build(def) {
  if (S.dead) return;
  if (def.kind === "upgrade" && (me().upgrades[def.id] || pendingCount(def.id) > 0)) return;
  if (isCapped(def)) return;
  const cost = buildCost(def);
  if (!canAfford(cost)) return;
  if (def.kind === "unit") {
    // One training rule in every era (E5): the army is capped by the LAND
    // (hexes x armyPerHex), and the recruit is a real person with a home.
    if (levyUsed() + 1 > levyCap()) return;
    if (def.popCost && civilians() - reserved() < def.popCost) return;
  } else if (def.popCost && civilians() - reserved() < def.popCost) return;
  for (const k in cost) me().res[k] -= cost[k];
  const wasEmpty = me().buildQueue.length === 0;
  me().buildQueue.push({ id: def.id, kind: def.kind, uid: ++me().buildSeq, total: def.buildTime, remaining: def.buildTime, cost });
  record("build", { id: def.id, kind: def.kind }, S.tick);
  // Pacing telemetry (console only): stamp the game clock when age research
  // starts, so playtest timing doesn't require watching the clock.
  if (CAPSTONES[def.id]) console.log(`[pacing] ${def.name} research started at ${fmtTime(playtime())} (t${S.tick})`);
  if (def.kind === "upgrade") {
    chronicle(wasEmpty ? `Work begins on ${def.name}.` : `${def.name} joins the queue (#${me().buildQueue.length}).`);
  } else if (def.kind === "unit") {
    chronicle(wasEmpty ? `${def.name} training begins.` : `${def.name} training joins the queue (#${me().buildQueue.length}).`);
  } else {
    chronicle(wasEmpty ? `Ground is broken for a ${def.name}.` : `A ${def.name} joins the queue (#${me().buildQueue.length}).`);
  }
  save();
  requestRender();
}

// Cancel anything in the queue -- including the item currently building --
// for a full refund of what was actually paid for it. Population reserved by
// a cancelled unit order is automatically freed, since idle()/reserved() are
// derived live from me().buildQueue rather than tracked separately.
// Removes a queue entry and hands its materials back. Shared by the player's
// cancel button and by the workforce reconciler, which has to abandon orders
// whose worker died.
export function dropQueueItem(idx) {
  const item = me().buildQueue[idx];
  if (!item) return null;
  for (const k in item.cost) me().res[k] = (me().res[k] || 0) + item.cost[k];
  me().buildQueue.splice(idx, 1);
  return item;
}

export function cancelBuild(uid) {
  if (S.dead) return;
  const idx = me().buildQueue.findIndex((q) => q.uid === uid);
  if (idx === -1) return;
  record("cancelBuild", { uid }, S.tick);
  const item = dropQueueItem(idx);
  // NAME ANYTHING THE QUEUE CAN HOLD. defById only knows buildings, upgrades
  // and units -- it has never known structures or the settle verb, so
  // cancelling a queued farm or a settling party threw a TypeError on this
  // line and took the whole tick with it. Found 2026-08-25; the queue has held
  // all four kinds since 6d, and nothing ever cancelled one in a test.
  const named = () => {
    if (item.kind === "settle") return item.label || "the settling party";
    if (item.kind === "structure") {
      const sd = structureDef(item.id);
      return sd ? sd.name : item.label || "the works";
    }
    const d = defById(item.id);
    return d ? d.name : item.id;
  };
  if (CAPSTONES[item.id]) console.log(`[pacing] ${named()} research cancelled at ${fmtTime(playtime())} (t${S.tick})`);
  chronicle(`Construction of the ${named()} is called off; materials recovered.`);
  save();
  requestRender();
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
  if (isOwned(tileId)) return null;
  const factor = marchFactor(tileId);
  // The claim's price is an era-fact (E3): Stone pays food and time only --
  // the first claim must be affordable before wood exists -- and later eras
  // price in their own materials. The route scales everything, as always.
  const spec = (active().map && active().map.claim) || { cost: { food: 40, wood: 25 }, time: 45 };
  // Escalation (E4, from the owner's first playtest: settling was trivial):
  // each claim beyond the starting trio costs claimScale more than the last,
  // the same per-copy idiom buildings use. Distance still multiplies on top.
  // QUEUED claims count too (owner bug report: queue two and both priced at
  // the same step) -- exactly as building costs already count their queue.
  const pendingClaims = me().buildQueue.filter((q) => q.kind === "settle").length;
  const esc = Math.pow(CONFIG.claimScale, Math.max(0, holdCount() + pendingClaims - 3));
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
  return me().buildQueue.some((q) => q.kind === "settle" && q.tile === tileId);
}

export function launchSettle(tileId) {
  if (S.dead) return;   // every era allocates hexes since E2
  if (atDominionCap()) return;   // the age can hold no more (dominionCap)
  const plan = settlePlan(tileId);
  if (!plan || pendingSettle(tileId)) return;
  if (!canAfford(plan.cost)) return;
  for (const k in plan.cost) me().res[k] -= plan.cost[k];
  record("settle", { tile: tileId }, S.tick);
  const terrain = world.places[tileId].terrain;
  me().buildQueue.push({ id: "settle", kind: "settle", uid: ++me().buildSeq,
    total: plan.time, remaining: plan.time, cost: plan.cost,
    tile: tileId, label: `Settling the ${terrain}` });
  chronicle(`A party sets out to raise a holdfast on the ${terrain}. (#${me().buildQueue.length} in the queue.)`);
  save();
  requestRender();
}

// ---------- Building on a hex ----------
// What a structure costs HERE, now: the era's base price escalated per copy
// already standing, exactly like a building line. Derived from the board rather
// than a counter, so it cannot drift.
export function structurePlan(sid) {
  const def = structureDef(sid);
  if (!def) return null;
  const n = structureCount(sid) + me().buildQueue.filter((q) => q.kind === "structure" && q.id === sid).length;
  const cost = {};
  for (const k in def.base) cost[k] = Math.ceil(def.base[k] * Math.pow(def.scale || 1, n));
  return { def, cost, time: def.buildTime };
}

// Is this structure available to build at all -- era declares it, and the
// unlocking upgrade is owned?
export function structureUnlocked(sid) {
  const def = structureDef(sid);
  return !!def && (!def.requires || !!me().upgrades[def.requires]);
}

// One queued build per hex, and never on a hex already carrying one: the hex
// has ONE use, and that law has to hold for pending work too or two parties
// would arrive to build different things on the same ground.
export function pendingBuild(tileId) {
  return me().buildQueue.some((q) => q.kind === "structure" && q.tile === tileId);
}

// THE SEAT IS NOT BUILDABLE (owner ruling, 2026-08-25). Two build systems
// exist and this is the line between them: the Construction panel raises things
// in YOUR SEAT -- the capital you rule from -- while building on a hex is you
// instructing one of your holdings what to become. Turning the seat itself into
// a farm would collapse the two into one confusing verb.
//
// It also protects a landmark: the three-house cluster on your seat is how the
// board says "you are here", and a board where that can be replaced by a wall
// is a board where you can lose your own capital in the fog.
export function canBuildOn(tileId) {
  return isOwned(tileId) && !!world && tileId !== world.home;
}

// Can this structure stand on this ground? A structure with no `terrain` list
// may stand anywhere -- a March-hold holds whatever hex it is raised on. The
// list is the whole reason the map decides anything: a Lumber Camp is a forest
// decision and a mine is a hills decision.
export function structureFits(sid, tileId) {
  const def = structureDef(sid);
  if (!def) return false;
  if (!def.terrain) return true;
  const p = world && world.places[tileId];
  return !!p && def.terrain.includes(p.terrain);
}

export function launchStructure(tileId, sid) {
  if (S.dead || !canBuildOn(tileId)) return;
  if (!structureUnlocked(sid) || pendingBuild(tileId)) return;
  if (!structureFits(sid, tileId)) return;           // wrong ground for it
  if (hexUse(tileId).kind === "structure") return;   // one use, and it is taken
  const plan = structurePlan(sid);
  if (!plan || !canAfford(plan.cost)) return;
  for (const k in plan.cost) me().res[k] -= plan.cost[k];
  record("structure", { tile: tileId, id: sid }, S.tick);
  me().buildQueue.push({ id: sid, kind: "structure", uid: ++me().buildSeq,
    total: plan.time, remaining: plan.time, cost: plan.cost,
    tile: tileId, label: `Raising a ${plan.def.name}` });
  chronicle(`Work begins on a ${plan.def.name}. (#${me().buildQueue.length} in the queue.)`);
  save();
  requestRender();
}

// ---------- Trade -------------------------------------------
// THE RELEASE VALVE for one-resource-per-hex. A decisive map can deal you a
// hand with no tin on it, and the answer that needs no friendly neighbour is a
// bank that always says yes at a bad rate -- Catan's 4:1, and the reason
// scarcity in Catan starts conversations instead of ending runs.
//
// Deliberately GENERAL in shape: `trade` takes a counterparty, and today the
// only counterparty is "bank". If humans ever drive the other seats, a
// player-to-player offer is this same verb with a different counterparty and a
// consent step -- no negotiation system has to exist until then, and with bots
// it never does. (2026-08-25 ruling: no player trade or diplomacy at 1.0.)

// Does this realm have a market standing? Trade is a thing you BUILT, on
// ground a rival can see and take -- not a menu that was always there.
export function hasMarket() {
  if (!S.map || !S.map.built) return false;
  for (const id of holdings()) {
    const def = structureDef((S.map.built || {})[id]);
    if (def && def.trades) return true;
  }
  return false;
}

// How many markets, and therefore how good the rate is. One market is the
// crude 4:1; each further market shaves the spread toward -- but never to --
// parity, so trading is always a loss and never a strategy on its own.
export function tradeRate() {
  if (!S.map || !S.map.built) return null;
  let n = 0;
  for (const id of holdings()) {
    const def = structureDef((S.map.built || {})[id]);
    if (def && def.trades) n += 1;
  }
  if (n <= 0) return null;
  return Math.max(CONFIG.tradeFloorRate, CONFIG.tradeBaseRate - (n - 1) * CONFIG.tradeRateStep);
}

// Give `give` of one resource, receive one of another. Refuses everything the
// UI would refuse, because the UI is not the only caller.
export function trade(giveRes, getRes, batches) {
  if (S.dead) return false;
  const rate = tradeRate();
  if (rate == null) return false;
  if (giveRes === getRes) return false;
  const live = active().resources;
  if (!live.some((r) => r.id === giveRes) || !live.some((r) => r.id === getRes)) return false;
  const n = Math.max(1, Math.floor(batches || 1));
  const cost = rate * n;
  if ((me().res[giveRes] || 0) < cost) return false;
  // Never trade INTO a full store: the goods would evaporate on arrival and
  // the player would have paid for nothing.
  const c = caps();
  if ((me().res[getRes] || 0) + n > (c[getRes] != null ? c[getRes] : Infinity)) return false;
  me().res[giveRes] -= cost;
  me().res[getRes] = (me().res[getRes] || 0) + n;
  record("trade", { give: giveRes, get: getRes, batches: n, rate }, S.tick);
  chronicle(`The market moves ${Math.round(cost)} ${giveRes} for ${n} ${getRes}. The traders take their cut.`);
  save();
  requestRender();
  return true;
}

// Tear it down and take the hex back. NO REFUND (design.md): converting is a
// trade, not a toggle you flip per situation.
export function demolishStructure(tileId) {
  if (S.dead || !isOwned(tileId)) return;
  const u = hexUse(tileId);
  if (u.kind !== "structure") return;
  const def = structureDef(u.id);
  record("demolish", { tile: tileId, id: u.id }, S.tick);
  setHexBuild(tileId, null);             // back to plain, unbuilt ground
  chronicle(`The ${def ? def.name : "works"} is pulled down. The ground is plain again, and nothing comes back.`);
  save();
  requestRender();
}

export function completeConstruction(site) {
  if (site.kind === "structure") {
    // The ground may have been lost while the work was queued -- a raid can
    // empty a hex and take it out of the dominion. The labour is simply wasted,
    // the same way a settling party finds its land already spoken for.
    if (!isOwned(site.tile)) {
      chronicle("The work crew arrives to find the ground no longer yours. Nothing is raised.", "bad");
      return;
    }
    const def = structureDef(site.id);
    setHexBuild(site.tile, site.id);
    chronicle(`${def ? def.name : "The works"} stands finished. The hex answers to it now.`, "good");
    return;
  }
  if (site.kind === "settle") {
    // The land may have been lost or taken while the party was queued;
    // captureTile refuses gracefully and the work is simply wasted -- the
    // frontier is like that.
    const ok = captureTile(site.tile, true);
    if (ok) chronicle(`A hall is raised and a lord installed — the ${world && world.places[site.tile] ? world.places[site.tile].terrain : "land"} is yours. One more holdfast under your banner.`, "big");
    else chronicle("The settling party finds the ground already spoken for, and turns back.", "bad");
    return;
  }
  const def = defById(site.id);
  if (def.kind === "upgrade") me().upgrades[def.id] = true;
  else if (def.kind === "unit") {
    // The recruit is drawn from the SEAT (owner ruling: no source
    // micromanagement -- the capital musters). If the seat is empty, the
    // largest holding sends its own; the person is real either way.
    if (def.popCost && S.map && S.map.pop && world) {
      let from = (S.map.pop[world.home] || 0) >= def.popCost ? world.home : null;
      if (!from) {
        let best = 0;
        for (const id of holdings()) {
          if ((S.map.pop[id] || 0) > best) { best = S.map.pop[id]; from = id; }
        }
      }
      // If every holding is empty there is nobody to draw, and training
      // anyway would mint a soldier from nothing -- the books desync the
      // player can't see. Refuse instead: the order is spent, the recruit
      // never appears. (Guarded 2026-08-25.)
      if (!from) {
        chronicle(`There is no one left to answer the muster. The order lapses.`, "bad");
        return;
      }
      S.map.pop[from] = Math.max(0, S.map.pop[from] - def.popCost);
      syncPopMirror();
    }
    me().units[def.id] = (me().units[def.id] || 0) + 1;
  }
  else me().builds[def.id] = (me().builds[def.id] || 0) + 1;
  onComplete(def);
}

// Which upgrade ids are age capstones, and where each one leads. The only
// per-capstone wiring an age transition needs.
export const CAPSTONES = { bronzeAge: "bronze", ironAge: "iron" };

export function onComplete(def) {
  if (CAPSTONES[def.id]) { advanceEra(CAPSTONES[def.id]); return; }

  // (The hut's housing announcement died in E3 with the hut itself. Its
  // branch outlived it referencing an undefined `n` -- a ReferenceError
  // waiting for the first manifest to name a building "hut". Removed
  // 2026-08-25.)
  if (def.kind === "unit") {
    chronicle(`A settler trains as a ${def.name}. You now field ${me().units[def.id]}.`, "good");
  } else {
    chronicle(`${def.name} complete. ${def.desc}`, "good");
  }
}

// The one and only place me().era is ever assigned. me().era is nothing more than
// the key into MANIFESTS -- every read of content goes through active() -- so
// flipping it swaps the entire world in one assignment. Everything else here
// is the transition machinery around that assignment, in a deliberate order:
//
//   1. Capture `before` values and the frozen SNAPSHOT while the old manifest
//      is still active. The snapshot is archived in me().eraHistory[fromEra]
//      (kept for every era, forever -- it's a few hundred bytes and it's the
//      raw material for diagnosing or recovering a bad migration, the
//      project's first genuinely destructive state change).
//   2. Flip me().era.
//   3. Run migrations. Formulas read ONLY the snapshot and write ONLY live
//      state, so instruction order cannot matter by construction.
//   4. Purge DOM nodes for ids that didn't survive -- the one place content
//      is ever allowed to leave the screen ("nothing can un-reveal" holds
//      everywhere except an era boundary).
//   5. reconcileWorkforce(), in case released workers left the books odd.
//
// The full announcement lives in a modal; a single milestone line still goes
// to the Chronicle so the settlement's own record contains the moment.
