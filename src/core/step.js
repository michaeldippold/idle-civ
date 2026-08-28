import { active } from "../content/compile.js";
import { completeConstruction } from "./actions.js";
import { CONFIG, TICK_SECONDS } from "./config.js";
import { caps, rates } from "./derived.js";
import { S, loopId, me, saveId } from "./state.js";
import { endFamine, growPopulation, starveTick, syncPopMirror } from "../map/map.js";
import { resolveEvents, runConverters } from "../sim/events.js";
import { resolveExpeditions } from "../sim/expeditions.js";
import { tickMilitary } from "../sim/contact.js";
import { tickBots } from "../sim/bots.js";
import { tickEraClock } from "../sim/eraclock.js";
import { chronicle, requestRender, runEnded } from "../core/bus.js";

// ---------- Core simulation ---------------------------------
// One fixed tick of the simulation: exactly TICK_SECONDS of world time,
// every time. Nothing variable enters -- the clock is a count, which is what
// makes (seed + tick count + actions) fully determine the state. The dt the
// subsystems receive below is the same constant on every call; they keep
// their per-second authoring and their signatures untouched.
export function step() {
  if (S.dead) return;
  const dt = TICK_SECONDS;
  // The tick lives here rather than in the loop so it counts exactly one
  // thing: how far the world actually moved. Pausing and hiding skip step()
  // entirely, so the clock freezes; death stops it via the guard above.
  S.tick += 1;

  // THE ECONOMY IS PER-PLAYER (S2, the antagonist spec): every living civ
  // gathers by its held ground, pays upkeep, hits its own era's caps, ticks
  // its own queue, and grows its own people. The human is simply the first
  // civ in the list; a bot's ledger runs identically and just has no UI. The
  // loop draws NO dice, so a recorded seed's future is untouched by it.
  for (const p of S.players) {
    if (p.broken) continue;
    if (economyTick(p, dt)) return;   // a starved-out human seat ended the run
  }

  // Sickness, conflict, windfalls -- whatever the active manifest's slate
  // holds. STILL THE VIEWER'S ALONE: events are authored as the watched
  // seat's story, and whether rivals share the hazards is open question 2 of
  // the antagonist spec -- the seam is this call site.
  resolveEvents(dt);

  // Outbound columns tick and resolve on the world's schedule.
  resolveExpeditions(dt);
  // ARMIES MARCH, AND BATTLES PLAY THEIR ROUNDS. Every civilization's, on the
  // same clock and through the same function -- symmetry is the point, so
  // there is no separate code path for a neighbour's column and anything the
  // board shows about yours is true of theirs. Marching runs under the contact
  // hooks: a step onto an enemy seals a battle, a contested hex bars the road,
  // and arrivals on enemy ground besiege or conquer (sim/contact.js).
  tickMilitary(dt);
  // THE NEIGHBOURS KEEP HOUSE. Settlement is lazy and idempotent (covers
  // boot, load and era entry with no persist hook); expansion and
  // re-garrisoning accrue real time, so pause holds a country still.
  tickBots(dt);
  // THE ERA CLOCK. Every other player runs a hidden countdown to its next age;
  // this is where it ticks. Ticks rather than wall-clock, so pause stops every
  // countdown and fast-forward speeds them all (design ruling 2).
  tickEraClock();

  // Conflict (and in principle anything else) can zero out population --
  // checked generically here rather than attributed to a specific event.
  if (me().pop <= 0) {
    die("conflict");
  }

  // NOTHING ENDS A TICK BELOW ZERO. growPopulation's budget math can leave a
  // float residual like -1e-16 (x - (x/p)*p), and fmt() floors -- so the
  // owner watched the larder read "-1" (2026-08-25). The mid-tick food clamp
  // runs BEFORE growth and events; this sweep is the one that guards what
  // actually gets displayed and saved. Every civ's books, same rule.
  for (const p of S.players) {
    for (const res of active(p).resources) {
      if (p.res[res.id] < 0) p.res[res.id] = 0;
    }
  }
}

// One civ's economy, one tick: gather -> converters (viewer only, until bots
// can build) -> caps -> famine -> the queue -> growth -> the mirror. Returns
// true only when a HUMAN seat starved out and the run must stop.
function economyTick(p, dt) {
  const human = p.key == null;
  const r = rates(p);

  // Gather + eat. Food is a net line so upkeep can drive it negative -> death.
  // The `|| 0` is load-bearing: a keyed civ's res was seeded from its authored
  // stock, which only names the resources that people HAS -- accruing onto a
  // missing key is NaN, found in the first live boot of S2.
  for (const res of active(p).resources) {
    p.res[res.id] = (p.res[res.id] || 0) + (res.id === "food" ? r.foodNet : r[res.id]) * dt;
  }

  // Converters count structures off the viewer's board; bots build nothing
  // until the brain (B1), so this stays a viewer call rather than growing a
  // parameter it could not yet honour.
  if (p.id === S.me) runConverters(dt);

  // A KEYED CIV'S TREASURY REGENERATES toward its own era's authored
  // baseline. Gold is the one resource no terrain yields -- the human buys
  // it at markets -- so with the restock retired, a bot traded dry would
  // stay dry FOREVER and the caravan loop would starve. This bounded trickle
  // stands in for "their merchants work" until the brain can trade (B1+);
  // bounded by the authored stock, so it can never compound.
  if (!human && p.key) {
    const own = (active(p).adversaries || []).find((a) => a.id === p.key);
    const baseGold = own && own.stock ? (own.stock.gold || 0) : 0;
    if ((p.res.gold || 0) < baseGold) {
      p.res.gold = Math.min(baseGold, (p.res.gold || 0) + CONFIG.botGoldRegen * dt);
    }
  }

  // Storage caps: surplus spoils/rots/is lost (silent; a one-time hint fires
  // via reveals). A bot's larder answers to its own era's ceilings -- income
  // replaced the authored restock (S2), and the caps are what keep an unspent
  // treasury from compounding forever.
  const c = caps(p);
  for (const res of active(p).resources) {
    if (p.res[res.id] > c[res.id]) p.res[res.id] = c[res.id];
  }

  // Starvation (E4): an empty larder no longer ends the run outright -- the
  // empire starves from its frontier inward, hex by hex, and the run ends
  // only when the SEAT empties. Keyed civs are EXEMPT while
  // CONFIG.botFamineExempt holds (the antagonist spec's safety valve: a bot
  // brain that starves its own people is a bug generator until the BUILD
  // card's food self-care rules exist and prove out).
  if (p.res.food <= 0 && r.foodNet < 0) {
    p.res.food = 0;
    const exempt = !human && CONFIG.botFamineExempt;
    if (!exempt && starveTick(-r.foodNet, dt, p)) {
      // A starved-out seat. For the seat the run is being played from, the
      // run ends; another human seat's fall is M2's business (per-viewer
      // endings) and until then simply leaves that civ's books empty.
      if (p.id === S.me) { die("starvation"); return true; }
    }
  } else if (p.res.food > 0) {
    endFamine(p);
  }
  if (p.res.food < 0) p.res.food = 0;

  // Only the item at the front of the queue is actively under construction --
  // no worker assignment needed; the queue itself is the scarcity.
  if (p.buildQueue.length) {
    const front = p.buildQueue[0];
    front.remaining -= CONFIG.buildSpeed * dt;
    if (front.remaining <= 0) {
      p.buildQueue.shift();
      completeConstruction(front, p);
    }
  }

  // Population grows toward its terrain caps, hex by hex -- the only growth
  // there is (the free-settler timer died in E3; expansion is a claim you
  // pay for). The mirror follows, so a civ's pop is always the truth.
  growPopulation(dt, p);
  syncPopMirror(p);
  return false;
}

export function die(cause) {
  S.dead = true;
  // One terse line so the Chronicle -- the settlement's memory -- still ends
  // with its own ending. The dramatic version and the actionable bits live in
  // the game-over modal instead.
  if (cause === "conflict") chronicle("The last defenders fall. The settlement is overrun.", "big");
  else chronicle("The last of your people starve. The settlement falls silent.", "big");
  // The badge, the body class and the modal are the INTERFACE's business --
  // ui/wire.js does that when it hears runEnded. This function used to do DOM
  // surgery inline, which is what forced the harness to stub `document` merely
  // to import the simulation.
  try { localStorage.removeItem(CONFIG.saveKey); } catch (e) {}
  if (loopId) clearInterval(loopId);
  if (saveId) clearInterval(saveId);
  // Last render before the loop stops, so the clock shows the run's final time.
  requestRender();
  runEnded(cause);
}
