import { active } from "../content/compile.js";
import { CONFIG } from "../core/config.js";
import { rng } from "../core/rng.js";
import { S, me, rivals } from "../core/state.js";
import { chronicle } from "../core/bus.js";
import { initAdversaries } from "../core/persist.js";
import { armiesOf, armyAt, formArmy, freeUnits } from "./armies.js";
import { claimTile, ensurePop, fillStartingGround, holdings, ownerOf, world } from "../map/map.js";

// ---------- BOTS: a neighbour becomes a country -----------------------------
// Until this module, a rival was a spawn point with a name: a seat marker on
// the map, a player record with an era clock, and raids that mustered out of
// nowhere. Now they HOLD GROUND -- their seat and a ring around it, claimed in
// the same ownership table the human uses -- they GARRISON their capital with
// a standing army sized by their own era's authoring, and they EXPAND on their
// own slow clock toward their era's dominion cap, exactly the ceiling the
// human answers to.
//
// Symmetry is still the law: their territory is `S.map.owner` entries like
// yours, their garrison is an army like yours, and marching onto their seat
// seals a battle through the same contact rules that defend your ground --
// with their capital's WALLS in the pool, so taking a bronze seat is a siege
// and taking an iron one is a war. What is deliberately NOT simulated: their
// economy. Ground and armies are what the board can show; the ledger behind
// them stays abstract until it can earn its keep.

// A civ's seat: the reborn carry their NEW seat on the record (`seatHex`); a
// RAZED people has no seat at all until rebirth; everyone else reads the
// generator's marker. Razing is on the civ record because the world rebuilds
// from the seed at load -- a mutation to world.places would quietly resurrect.
export function seatOf(civ) {
  if (civ.seatHex) return civ.seatHex;
  if (civ.seatRazed) return null;
  if (!world) return null;
  for (const id in world.places) {
    if (world.places[id].adversary === civ.key) return id;
  }
  return null;
}

// Whose LIVING capital stands on this hex, if anyone's. The single question
// every seat read goes through now -- walls, marks, cards, dressing -- so a
// razed marker hex is ordinary wilderness everywhere at once.
export function seatCivAt(hexId) {
  for (const civ of rivals()) {
    if (seatOf(civ) === hexId) return civ;
  }
  return null;
}

// THE LEVY BINDS EVERYONE (owner playtest, 2026-08-26: a bronze garrison of
// SEVENTEEN against an authored seven, because raids minted units from
// nothing and every regarrison minted a fresh set on top). The human's law --
// territory times armyPerHex is the ceiling -- now caps the bots too, floored
// at their authored strength so a small people always fields its core. Their
// territory IS their war machine: sack their hexes and the armies they can
// field shrink with the ground.
export function botLevyCap(civ) {
  const def = (active(civ).adversaries || []).find((a) => a.id === civ.key);
  const core = Math.max(2, (def && def.strength) || 4);
  return Math.max(core, holdings(civ.id).length * CONFIG.armyPerHex);
}
export function botTotalUnits(civ) {
  let n = 0;
  for (const k in civ.units) n += civ.units[k] || 0;
  return n;
}
// Mint only the shortfall, and only up to the levy: existing free units
// muster first, because a pool that never drains is how seventeen happened.
export function botMint(civ, uid, wanted) {
  const free = Math.max(0, freeUnits(uid, civ));
  const room = Math.max(0, botLevyCap(civ) - botTotalUnits(civ));
  const mint = Math.min(Math.max(0, wanted - free), room);
  if (mint > 0) civ.units[uid] = (civ.units[uid] || 0) + mint;
  return Math.min(wanted, free + mint);
}

// The standing garrison a seat deserves, read from the civ's OWN era: the
// adversary def's `strength` is the headcount (5 at Stone, 32 for an Iron
// kingdom -- the scaling is already authored), split toward archers where the
// age can field them, because archers are the ones who shoot from walls.
function garrisonCounts(civ) {
  const def = (active(civ).adversaries || []).find((a) => a.id === civ.key);
  const n = Math.max(2, (def && def.strength) || 4);
  const hasArchers = active(civ).units.some((u) => u.id === "archer");
  if (!hasArchers) return { soldier: n };
  const archers = Math.max(1, Math.floor(n / 3));
  return { soldier: n - archers, archer: archers };
}

// Claim one hex for a civ, respecting everything the human respects: land
// only, unowned only, never a minor's steading and never another power's seat.
function claimable(id, civ) {
  const p = world.places[id];
  if (!p || p.terrain === "water" || p.minor) return false;
  if (p.adversary && p.adversary !== civ.key) return false;
  return ownerOf(id) == null;
}

// ---- Settlement: the country exists ----------------------------------------
// Idempotent and lazy: called every tick from tickBots, it does work only for
// a civ that has not been seated yet (fresh world) or whose garrison has been
// destroyed long enough to muster again. Lazy-on-tick covers boot, load and
// era entry without persist.js ever importing the sim.
function settle(civ) {
  const seat = seatOf(civ);
  if (!seat) return;
  if (ownerOf(seat) == null) {
    claimTile(seat, civ.id);
    civ.seat = seat;
    // The ring: a modest home country, so the border you eventually meet is a
    // border and not a single tile. Land only, and never at anyone's expense.
    let taken = 0;
    for (const n of world.places[seat].adj) {
      if (taken >= CONFIG.botHomeRing) break;
      if (claimable(n, civ)) { claimTile(n, civ.id); taken++; }
    }
  }
  // THE COUNTRY HAS PEOPLE (S2, the per-player economy). A bot's home ground
  // arrives WORKED TO CAPACITY, the same opening rule the human trio follows
  // ("the starting trio arrives full") -- their income starts real rather
  // than trickling up from a settling party. Once, lazily, and flagged on the
  // record so a loaded save from before the books heals itself here too.
  if (!civ.booksSeeded && ownerOf(seat) === civ.id) {
    ensurePop(civ.id);
    fillStartingGround(civ);
    civ.booksSeeded = true;
  }
  // THE GARRISON. A capital with nobody home is an invitation, so the seat
  // keeps a standing army -- fight-to-the-last, because it is the capital.
  // If it dies in a war, a new one musters after a decent interval: a people
  // recovers, and a window where their seat is takeable is the reward for
  // having beaten the last garrison.
  if (armyAt(seat, civ)) {
    civ.regarrisonT = 0;   // the clock below measures how long the seat has been BARE
  } else {
    if (civ.everGarrisoned && (civ.regarrisonT || 0) < CONFIG.botRegarrisonSeconds) return;
    const counts = garrisonCounts(civ);
    // Muster from the pool first, mint only the shortfall, respect the levy.
    const mustered = {};
    for (const uid in counts) {
      const got = botMint(civ, uid, counts[uid]);
      if (got > 0) mustered[uid] = got;
    }
    if (!Object.keys(mustered).length) return;
    const army = formArmy(seat, mustered, "never", civ);
    if (army) {
      army.intent = "garrison";
      civ.everGarrisoned = true;
      civ.regarrisonT = 0;
    }
  }
}

// ---- Expansion: the country grows ------------------------------------------
// One hex at a time, on a slow clock, up to the civ's OWN era's dominion cap
// -- the same scope law that limits the human. The frontier hex is drawn with
// the game dice from every claimable neighbour of their holdings, so two runs
// of one seed grow the same empire.
function expand(civ, dt) {
  civ.claimT = (civ.claimT || 0) + dt;
  if (civ.claimT < CONFIG.botClaimSeconds) return;
  const cap = (active(civ).map && active(civ).map.dominionCap) || Infinity;
  const held = holdings(civ.id);
  if (held.length >= cap) { civ.claimT = 0; return; }
  const frontier = [];
  for (const id of held) {
    for (const n of world.places[id].adj) {
      if (claimable(n, civ) && !frontier.includes(n)) frontier.push(n);
    }
  }
  if (!frontier.length) { civ.claimT = 0; return; }
  civ.claimT -= CONFIG.botClaimSeconds;
  claimTile(frontier[Math.floor(rng() * frontier.length)], civ.id);
  // The new ground enters the books at 2 -- a settling party that grows into
  // the place, exactly the human's claim arithmetic (S2).
  ensurePop(civ.id);
}

// ---- Rebirth: a people rises again (owner ruling, 2026-08-26) --------------
// "If you clear 2/3 opponents early there's really not much of a game left."
// A broken people's countdown (drawn at the break, sim/contact.js) accrues
// here; when it expires AND their old seat site is unowned, they return --
// FAIRLY RESET, per the ruling: the seat and a ring, stores restocked to
// their era's baseline, NO garrison for the first minutes (a newborn nation
// is raidable), and territory rebuilt one hex at a time by the ordinary
// expansion clock. They keep the era they fell at: the living rivals kept
// advancing while they were ash, and that setback is the fair one.
//
// NO OCCUPATION TAX (owner, emphatically): if the seat site is settled ground
// when the clock fires, the rebirth simply WAITS for the site to free up.
// A hex in a dominion paying its way is not an army camped in ruins; erasure
// is a choice priced in a dominion slot, never an upkeep.
// Where a new people rises: unowned land, no minor, no living seat, and AT
// LEAST rebirthMinDistance from every holding of every player -- safe by
// geography, not by rules (owner: rebirth at the old seat "is just the
// occupation thing again -- leave an army there and resack as soon as they
// come back"). Among the far-enough candidates the game dice choose; if the
// board has grown too crowded for the threshold, the farthest hex wins.
function rebirthSite(civ) {
  if (!world) return null;
  const taken = [];
  for (const pl of S.players) for (const id of holdings(pl.id)) taken.push(world.places[id]);
  const far = [];
  let best = null, bestD = -1;
  for (const id in world.places) {
    const p = world.places[id];
    if (p.terrain === "water" || p.minor) continue;
    if (ownerOf(id) != null) continue;
    if (seatCivAt(id)) continue;
    let d = Infinity;
    for (const t of taken) {
      const dd = (Math.abs(p.q - t.q) + Math.abs(p.r - t.r) + Math.abs((p.q + p.r) - (t.q + t.r))) / 2;
      if (dd < d) d = dd;
    }
    if (d > bestD) { bestD = d; best = id; }
    if (d >= CONFIG.rebirthMinDistance) far.push(id);
  }
  if (far.length) return far[Math.floor(rng() * far.length)];
  return best;
}

function tickRebirth(civ, dt) {
  if (civ.rebirthIn == null) return;          // the human's fall ends the run instead
  civ.rebirthT = (civ.rebirthT || 0) + dt;
  if (civ.rebirthT < civ.rebirthIn) return;
  const site = rebirthSite(civ);
  if (!site) return;                          // a full board: wait for room
  civ.seatHex = site;                         // A NEW SEAT, far from everyone
  civ.broken = false;
  civ.rebirthT = 0;
  civ.rebirthIn = null;
  civ.seenEra = null;
  civ.booksSeeded = false;                    // the new ground seeds full at settle (S2)
  // RESTOCK THE NEWBORN LARDER to its era's authored baseline. This is the
  // one restock that survived S2 (income replaced the per-era one): a fairly
  // reset people starts with a fresh start's stores, per the rebirth ruling.
  {
    const own = (active(civ).adversaries || []).find((a) => a.id === civ.key);
    if (own) civ.res = Object.assign({}, own.stock);
  }
  initAdversaries();                          // reseat bookkeeping (walls, colours)
  civ.everGarrisoned = true;                  // the regarrison DELAY applies: born undefended
  civ.regarrisonT = 0;
  civ.claimT = 0;
  civ.standing = 0;                           // a new people owes you nothing, remembers nothing
  civ.seat = null;                            // settle() reseats from seatOf()
  const def = (active(civ).adversaries || []).find((a) => a.id === civ.key);
  const name = def ? def.name.charAt(0).toUpperCase() + def.name.slice(1) : "A people";
  chronicle(`${name} rise again — a new people on new ground, far from the old, with everything to rebuild.`, "bad");
  settle(civ);
}

// The world tick (core/step.js). Settlement is lazy and idempotent; expansion
// and re-garrisoning accrue real time, so pause holds a country still the way
// it holds everything else.
export function tickBots(dt) {
  if (!world || !S.map) return;
  for (const civ of rivals()) {
    if (civ.broken) { tickRebirth(civ, dt); continue; }
    civ.regarrisonT = (civ.regarrisonT || 0) + dt;
    settle(civ);
    expand(civ, dt);
  }
}
