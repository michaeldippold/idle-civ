import { DEF_INDEX, active } from "../content/compile.js";
import { S } from "../core/state.js";
import { CONFIG } from "../core/config.js";
import { rng } from "../core/rng.js";
import { log } from "../ui/log.js";
import { CONTINENTS, SIGHT_RANGE } from "./continents.js";
import { generateMap, GEN_VERSION, pickContinent } from "./generate.js";
import { hexDistance } from "./model.js";
import { hashStr } from "./model.js";

// ---------- The world, wired to state (map.md §2) -----------
// `world` is runtime geometry, rebuilt from the seed at every load and era
// entry -- never saved. What persists is S.map, and it is tiny: the sub-seed,
// the generator version, the tile noun it was cut for, and the mutable
// per-place facts (today: which tiles are yours). The living remnants that
// already survive era flips (S.adversaries -- stock, standing, walls) are
// keyed by adversary id, not geometry, so they reattach to a rebuilt world
// for free.
export let world = null;

// Idempotent, like initAdversaries(), and called from the same places: boot,
// load, era entry. **The map is generated once and NEVER regenerates**
// (map.md 2.6, One board, forever). It used to recut whenever the tile noun
// changed; that is retired. Eras re-denominate what a tile IS and change what
// you can see and do on it -- they never rebuild the ground, because ground
// you rebuild is ground you cannot re-dress, and the per-era re-dress is the
// whole visual arc. Only a GEN_VERSION bump regenerates now: a deliberate,
// visible dev-time reshape.
// `?continent=broadwater` forces a continent, the QA affordance standing in
// for slice 5's picker: testing a shape should not mean rolling New Game
// until the seed happens to offer it. Sits beside ?map=2d, ?glcheck=1.
function forcedContinent() {
  try {
    const want = new URLSearchParams(location.search).get("continent");
    return want && CONTINENTS.some((c) => c.id === want) ? want : null;
  } catch (e) { return null; }
}

// The continent the player PICKED on the start screen, or null for Random.
// Set once during boot, before ensureMap() runs, from the choice the start
// screen stashed across its reload. Null is not a failure: it means "Random",
// and Random is simply the absence of a pick -- the continent then comes from
// the run seed, which is what makes a bare seed number reproduce a random run.
let picked = null;
export function setPickedContinent(id) {
  picked = id && CONTINENTS.some((c) => c.id === id) ? id : null;
}

export function ensureMap() {
  const spec = active().map;
  if (!spec) { world = null; return; }   // an era without a map (Stone)

  const noun = spec.tileNoun.singular;
  if (!S.map || S.map.gen !== GEN_VERSION) {
    const firstChart = !S.map;
    // The sub-seed folds the noun into the run's seed: one number per run
    // per world-scale, stable across any number of regenerations.
    S.map = {
      seed: (S.seed ^ hashStr(noun)) >>> 0,
      gen: GEN_VERSION,
      tileNoun: noun,
      // WHICH continent this run is played on. Drawn from the run seed, so a
      // bare seed number still reproduces the whole world; slice 5's picker
      // will write a chosen one here instead (map.md 2.6).
      // Order matters: the URL is a QA OVERRIDE and outranks everything, then
      // the player's pick, then the seed (which is what "Random" means).
      continent: S.map && S.map.continent ? S.map.continent
        : forcedContinent() || picked || pickContinent(S.seed),
      owned: ["0,0"],
    };
    if (firstChart && !S.seen.mapCharted) {
      S.seen.needsStartingTrio = true;   // granted below, once the world exists
    }
    if (firstChart && !S.seen.mapCharted) {
      S.seen.mapCharted = true;
      log("Your people mark the ground they stand on. The world is wider than this.", "good");
    }
  }
  world = generateMap(S.map.seed, spec, S.map.continent);
  // THE 3-HEX START (owner ruling, 2026-08-23, ratifying the E2 bridge's
  // accident): a fresh run opens with the seat plus two adjacent land hexes.
  //
  // VARIETY IS NOW GUARANTEED (2026-08-25), and the note that used to stand
  // here -- "deliberately NO terrain-variety guarantee: wanting the forest you
  // didn't get is the claim verb's first motivation" -- was correct only while
  // a hex could be pointed at any resource. Under one-resource-per-terrain an
  // all-river trio yields food and nothing else, and claiming costs wood: the
  // opening deadlocks on a map that looks perfectly friendly. So the two
  // neighbours are chosen to widen what you produce, ties broken by the old
  // stable order so a seed still reproduces exactly.
  if (S.seen.needsStartingTrio) {
    delete S.seen.needsStartingTrio;
    const neighbours = world.places[world.home].adj
      .map((id) => world.places[id])
      .filter((p) => p.terrain !== "water" && !p.adversary && !p.minor)
      .sort((a, b) => (a.r - b.r) || (a.q - b.q));
    const seatRes = (terrainYield(world.home) || {}).res;
    const taken = new Set([seatRes]);
    const chosen = [];
    // First pass: anything that broadens the economy. Second: fill from what
    // is left, in the same stable order.
    for (const p of neighbours) {
      if (chosen.length >= 2) break;
      const res = (terrainYield(p.id) || {}).res;
      if (res && !taken.has(res)) { taken.add(res); chosen.push(p); }
    }
    for (const p of neighbours) {
      if (chosen.length >= 2) break;
      if (!chosen.includes(p)) chosen.push(p);
    }
    for (const p of chosen) {
      if (!S.map.owned.includes(p.id)) S.map.owned.push(p.id);
    }
    S.seen.fillStartingGround = true;   // granted below, once pop exists
  }
  if (!S.map.built) S.map.built = {};   // what stands on each hex, if anything
  if (!S.map.minors) S.map.minors = {}; // the minors' living remnants
  // Reconcile the minor remnants, initAdversaries-style: a seat without state
  // gets one seeded from the world def; a CAPTURED seat (owned) needs none --
  // ownership trumps the minor def on every read. And an age that has turned
  // re-stocks it, on exactly the terms initAdversaries spells out: larders
  // refill and walls rebuild across an era, never within one.
  //
  // `p.minor` is already era-correct without any work here, because the world
  // is regenerated from the CURRENT era's spec on every ensureMap -- the roll
  // ranges climb by age, so the same steading is simply richer than it was.
  for (const id in world.places) {
    const p = world.places[id];
    if (!p.minor || S.map.owned.includes(id)) continue;
    const st = S.map.minors[id];
    if (!st || st.era !== S.era) {
      S.map.minors[id] = {
        walls: p.minor.wallsMax,
        stock: Object.assign({}, p.minor.stock),
        era: S.era,
      };
    }
  }
  syncDominion();
  ensurePop();
  if (S.seen.fillStartingGround) {
    delete S.seen.fillStartingGround;
    fillStartingGround();
    syncPopMirror();
  }
  syncCharted();
  // (A `S.seen.needsDefaultWork` gate stood here reading a flag NOTHING ever
  // set -- the border bread-default that set it died in E5. Removed
  // 2026-08-25; defaultAssignments() survives as a callable verb, since new
  // ground defaults to food at capture and the sweep is still the right
  // answer if a hex is ever left unassigned.)
}

// The pop-tiles LOCKSTEP died in E3 (it was the E2 bridge, and its runaway
// was live-confirmed: huts handed out provinces until the whole world was
// free real estate). Dominion now changes ONLY by claim, capture and fealty.
// What survives here is hygiene: the seat is always owned, lost work entries
// are pruned, the books get seeded, and the pop mirror is refreshed.
// **Dominion never shrinks** (owner ruling, 2026-08-22) still stands -- there
// is simply no machinery left that could shrink it.
export function syncDominion() {
  if (!world || !S.map) return;
  const owned = S.map.owned;
  if (!owned.includes(world.home)) owned.unshift(world.home);
  for (const tid in S.map.built) if (!owned.includes(tid)) setHexBuild(tid, null);
  ensurePop();
  syncPopMirror();
}

// S.pop is a MIRROR now (E3): the floored hex sum plus the standing army.
// Everything legacy that still reads S.pop -- reveal gates, the levy cap,
// event scaling, civilians() -- sees the real population, until E5 re-homes
// the army and S.pop can retire outright.
export function syncPopMirror() {
  if (!S.map || !S.map.pop) return;
  let units = 0;
  for (const k in S.units) units += S.units[k] || 0;
  S.pop = hexPopSum() + units;
}

// What the player has SEEN. Sticky and additive, never removed -- the
// interface's reveals-are-sticky law applied to geography. You always see the
// country adjacent to what you hold; reaching beyond that is what the scouting
// verb is for (slice 6). Fog hides the BOARD, never the pieces: an unrevealed
// tile shows as unpainted board, and what it turns out to be is honest ground
// that was always there.
// Charting new ground can put new sea -- and new shores -- in view.
export function syncCharted() {
  if (!world || !S.map) return;
  if (!S.map.revealed) S.map.revealed = [];
  const seen = new Set(S.map.revealed);
  for (const id of S.map.owned) {
    seen.add(id);
    const p = world.places[id];
    if (p) for (const n of p.adj) seen.add(n);
  }
  S.map.revealed = Array.from(seen);
  const sightedLand = syncSighted();
  if (sightedLand > 0 && S.seen.mapCharted) {
    log(sightedLand === 1
      ? "From the shore, your people make out land across the water."
      : "From the shore, your people make out land across the water — more of it than they expected.",
      "good");
  }
}

// QA ONLY (owner request, 2026-08-24): show the whole board, on demand, so a
// continent's shape can be judged without playing out to it. Deliberately NOT
// in the save and NOT in the signature -- it is a lens on the world, like
// pause and speed, and the button invalidates the stage by hand when it
// flips. The charted set underneath is untouched, so flipping it back leaves
// the run exactly as honest as it was.
export let revealAll = false;
export function setRevealAll(v) { revealAll = v; }

export function isCharted(id) {
  if (revealAll) return true;
  return !!S.map && !!S.map.revealed && S.map.revealed.includes(id);
}

// ---------- Sight across water (map.md 2.6, slice 4b) ----------
// Standing on a charted coast you can see out to sea, and you can see THAT
// there is land across it -- never what is on that land. A ray leaves every
// charted coastal hex, travels through WATER ONLY up to SIGHT_RANGE steps,
// and is STOPPED by the first land it touches: you see an island's near
// shore, never behind it, so even a sighted island keeps its size secret.
//
// Sight reveals the BOARD, never the PIECES -- the charted honesty rule,
// inverted. Sighted ground draws its true terrain (if you can genuinely see
// it, showing anything else would be a lie) and carries no props, no marks
// and no interaction. Charted-versus-sighted reads as inhabited-versus-
// silhouette, which is also just true: you cannot make out dwellings at that
// distance.
//
// Sticky and additive, like charting. Returns how many new LAND hexes came
// into view, so the Chronicle can mark the moment.
export function syncSighted() {
  if (!world || !S.map) return 0;
  if (!S.map.sighted) S.map.sighted = [];
  const wet = (p) => !p || p.ocean || p.terrain === "water";
  const seen = new Set(S.map.sighted);
  let newLand = 0;

  // RAYS LEAVE FROM GROUND YOU STAND ON, not from ground you have merely
  // glimpsed. This read `S.map.revealed` until 2026-08-24, and charted
  // includes every NEIGHBOUR of every owned hex -- so a fresh game cast rays
  // from about twelve hexes instead of three, from shorelines nobody had ever
  // walked to. It compounded as you settled, since each new claim charted a
  // new ring of vantage points it did not own.
  //
  // Measured on the old rule: 34 hexes visible from a 3-hex dominion, with
  // land showing FIVE steps from the nearest owned tile (a charted hex one
  // step out, plus three of open water, plus the far shore). Owner caught it
  // in play: "my starting revealed slices keep getting bigger and bigger."
  for (const id of S.map.owned) {
    const from = world.places[id];
    if (!from || wet(from)) continue;          // rays leave dry, OWNED ground
    const dist = {};
    let frontier = [];
    for (const n of from.adj) {
      if (!wet(world.places[n]) || dist[n] !== undefined) continue;
      dist[n] = 1; frontier.push(n);
    }
    while (frontier.length) {
      const next = [];
      for (const w of frontier) {
        seen.add(w);                            // the sea itself is seen
        for (const n of world.places[w].adj) {
          const q = world.places[n];
          if (!wet(q)) {                        // land stops the ray
            if (!seen.has(n) && !isCharted(n)) newLand += 1;
            seen.add(n);
            continue;
          }
          if (dist[n] !== undefined) continue;
          if (dist[w] >= SIGHT_RANGE) continue; // no further open water
          dist[n] = dist[w] + 1;
          next.push(n);
        }
      }
      frontier = next;
    }
  }

  S.map.sighted = Array.from(seen);
  return newLand;
}

// Seen from afar but not charted: drawn, never touched.
export function isSighted(id) {
  if (revealAll) return false;                  // the lens charts everything
  return !!S.map && !!S.map.sighted && S.map.sighted.includes(id) && !isCharted(id);
}

// Drawn at all: charted ground, or ground the eye can reach.
export function isVisible(id) {
  return isCharted(id) || isSighted(id);
}

// (defaultAssignments() died here 2026-08-25 with the allocation verb. It
// existed because a fresh dominion arrived pointed at nothing and starved
// while the player worked out what a stepper was; ground works itself now,
// so there is no default left to ship.)

// ---------- Population lives on hexes (engine rework E1) ----------
// design.md, "Population Lives Somewhere". In E1 this is pure state: it
// grows, saves, and displays, and NOTHING reads it yet -- steppers still run
// the economy, so the curve can be watched and tuned live before anything
// depends on it. Population is a VARIABLE, not a control: no setter is
// exported to the UI, only to the world (growth here; plague/raids/starvation
// write to it in later slices).

// Carrying capacity of a hex: terrain x era. Missing terrain (water) is 0.
export function capOf(id) {
  const spec = active().map;
  if (!spec || !spec.popCaps || !world || !world.places[id]) return 0;
  return spec.popCaps[world.places[id].terrain] || 0;
}

export function hexPop(id) {
  return S.map && S.map.pop ? Math.floor(S.map.pop[id] || 0) : 0;
}

// The odometer: total population is the SUM of real per-hex numbers.
// ---------- What a hex IS (the use seam) ----------
// ONE HEX, ONE USE. A hex is BARE -- working the ground it is made of -- or it
// carries exactly one STRUCTURE. There is no third state and no parallel town
// beside the fields (design.md, Building on a Hex).
//
// SIMPLIFIED 2026-08-25 with the hex economy. The slot used to hold either a
// chosen RESOURCE ("wood") or a prefixed structure ref ("build:farm"), because
// a hex could be pointed at any resource its terrain would grudgingly give.
// Terrain decides that now -- a forest makes wood -- so the slot only ever
// holds a structure id, the prefix has nothing to disambiguate from, and
// `S.map.work` became `S.map.built`, which is what it always meant.
//
// A bare hex is not an idle hex: it works its ground automatically. "Rest" is
// gone with the allocation verb that needed it.

export function hexUse(id) {
  const b = (S.map && S.map.built) ? S.map.built[id] : null;
  return b ? { kind: "structure", id: b } : { kind: "bare" };
}

// THE ONLY WRITER of S.map.built. Every path that changes what stands on a hex
// -- raising, demolishing, capture, losing the ground -- comes through here, so
// the render stamp below cannot be forgotten by the next caller. Pass null to
// clear the hex back to bare ground.
//
// `buildVersion` is a render-cache stamp, not game state: it lets ui/map.js ask
// "did anything on the board change?" in O(1) instead of serialising the whole
// map five times a second. It deliberately does NOT ride in the save -- a
// reload rebuilds the stage from nothing, so starting back at zero is correct.
let buildVersion = 0;
export function workStamp() { return buildVersion; }

export function setHexBuild(id, value) {
  if (!S.map || !S.map.built) return;
  if (value == null) delete S.map.built[id];
  else S.map.built[id] = value;
  buildVersion += 1;
}

// WHAT A HEX YIELDS, and the rate it yields it at: `{res, rate}` or null.
//
// CORRECTED 2026-08-25, one day after the seam was built. It originally said a
// structure never produces -- and the very first structure, the farm, produces
// food at a better rate than any bare ground. The rule was wrong, not the farm:
// a structure occupies a hex INSTEAD OF working it, which is not the same as
// yielding nothing. A structure may declare a `yield`, and if it does this is
// where it answers.
//
// The rate lives here too, so callers never have to know that worked ground
// reads the terrain table while a structure carries its own flat number. That
// asymmetry is the whole point of the farm: it is better than the ground it
// stands on, which is why it is worth paying for.
export function hexYield(id) {
  const u = hexUse(id);
  if (u.kind === "structure") {
    const def = structureDef(u.id);
    // A structure with no declared yield produces nothing -- a March-hold and
    // a Market are both exactly that, and it is a legitimate answer rather
    // than a missing one. A structure REPLACES the ground's own yield, which
    // is why raising one costs you whatever the hex was already doing.
    return def && def.yield ? { res: def.yield.res, rate: def.yield.rate } : null;
  }
  // Bare ground works itself. One resource per terrain (2026-08-25): the hex
  // does not choose and cannot be pointed elsewhere.
  return terrainYield(id);
}

// What the GROUND under a hex gives, ignoring anything built on it. Kept
// separate from hexYield so the interface can say "this forest would give
// wood" about country you do not own, and so a structure's description can be
// honest about what it is replacing.
export function terrainYield(id) {
  const terrain = world && world.places[id] ? world.places[id].terrain : null;
  const yields = (active().map && active().map.yields) || {};
  const y = terrain ? yields[terrain] : null;
  return y ? { res: y.res, rate: y.rate } : null;
}

// The structures this era can build. Declared per manifest and inherited, so an
// age that says nothing keeps what it could already raise.
export function structureDef(id) {
  // Active era first, then the cross-era index -- exactly what defById does
  // for everything else. A queued Forge whose era turned over while it was
  // still building must still know its own name.
  return (active().structures || []).find((d) => d.id === id) || DEF_INDEX[id] || null;
}

// Does this hex yield anything into the ledger? Resting ground does not, and
// neither does a structure with nothing to give.
export function hexProduces(id) { return !!hexYield(id); }

// The resource a hex is turned to, or null. The one accessor every producer,
// glyph and panel should ask.
export function hexResource(id) {
  const y = hexYield(id);
  return y ? y.res : null;
}

// THE WALLS THAT COVER THIS HEX. Sums every march-hold within `fortRange`,
// including one standing on the hex itself. Flat strength, added to the army
// rather than scaling it -- see CONFIG.fortStrength.
//
// This is a RESOLUTION input and never a selection one (design.md: selection and
// resolution are separate phases). Nothing here may influence whether a raid
// happens or where it lands; it only changes what happens when one arrives.
export function fortStrength(hexId) {
  if (!S.map || !world || !world.places[hexId]) return 0;
  let n = 0;
  for (const id of S.map.owned) {
    const u = hexUse(id);
    if (u.kind !== "structure") continue;
    const def = structureDef(u.id);
    if (!def || !def.fortifies) continue;
    const a = world.places[id], b = world.places[hexId];
    if (hexDistance(a.q, a.r, b.q, b.r) <= CONFIG.fortRange) n++;
  }
  return n * CONFIG.fortStrength;
}

// HEALERS COVERING THIS HEX. Same shape as fortStrength, and deliberately so:
// range is how this board says "near", and the two systems that care about
// nearness should say it the same way.
//
// POSITIONAL FROM 2026-08-25 (owner ruling). As a panel building the infirmary
// stacked for no reason except that it could -- three was strictly better than
// one and asked nothing of you. Standing on ground, the second one exists
// because your realm got WIDER, and a corner of it left uncovered is a real
// consequence of a real choice.
//
// This is a RESOLUTION input, never a selection one: it cannot change whether
// sickness happens or where it lands, only what happens when it arrives.
export function healersNear(hexId) {
  if (!S.map || !world || !world.places[hexId]) return 0;
  let n = 0;
  for (const id of S.map.owned) {
    const u = hexUse(id);
    if (u.kind !== "structure") continue;
    const def = structureDef(u.id);
    if (!def || !def.heals) continue;
    const a = world.places[id], b = world.places[hexId];
    if (hexDistance(a.q, a.r, b.q, b.r) <= CONFIG.healRange) n++;
  }
  return n;
}

// Every structure of this kind standing anywhere in the dominion, with its
// def -- what a converter needs, and what a "do I own one at all?" reveal
// predicate needs. The board is the source of truth: no counter to drift.
export function builtCount(sid) {
  if (!S.map || !S.map.built) return 0;
  let n = 0;
  for (const id of S.map.owned) if (S.map.built[id] === sid) n++;
  return n;
}

// How many hexes already carry this structure -- the per-copy cost escalator,
// derived rather than stored so it can never drift from the board.
export function structureCount(sid) {
  if (!S.map || !S.map.built) return 0;
  let n = 0;
  for (const id of S.map.owned) {
    const u = hexUse(id);
    if (u.kind === "structure" && u.id === sid) n++;
  }
  return n;
}

export function hexPopSum() {
  if (!S.map || !S.map.pop) return 0;
  let sum = 0;
  for (const id of S.map.owned) sum += Math.floor(S.map.pop[id] || 0);
  return sum;
}

// Seed population for owned hexes that have none, prune entries for hexes no
// longer owned. Idempotent, like everything else at this layer. The seat
// starts at startPop (the three survivors); any other hex enters the books at
// 2 -- the party that claimed it.
export function ensurePop() {
  if (!S.map || !world) return;
  if (!S.map.pop) S.map.pop = {};
  // Ground taken LATER arrives as a settling party and grows into the place:
  // that dip is what makes a claim an investment rather than a free upgrade.
  for (const id of S.map.owned) {
    if (!(id in S.map.pop)) S.map.pop[id] = 2;
  }
  for (const id in S.map.pop) if (!S.map.owned.includes(id)) delete S.map.pop[id];
}

// THE STARTING TRIO ARRIVES FULL (owner ruling, 2026-08-25). Your opening
// ground is worked to what its terrain supports from the first frame.
//
// This began as an economy bug and turned out to be an idle-game remnant.
// Under one resource per terrain, food is capped by your FOOD ground while
// EVERY hex adds mouths -- so a realm holding one plains, one forest and one
// hills at a third of capacity produced barely more food than it ate, and
// claiming a fourth barren hex tipped it permanently negative: stranded at
// zero food, unable to grow and unable to afford the claim that would fix it.
// Raising yields would have papered over it. The actual defect was that "a
// wanderer joins your settlement" was LOAD-BEARING -- the opening was a wait,
// which is precisely what this game stopped being two pivots ago.
//
// Wanderers still arrive. They arrive to fill ground you have just taken,
// which is a 4X sentence rather than an idle one.
export function fillStartingGround() {
  if (!S.map || !S.map.pop || !world) return;
  for (const id of S.map.owned) S.map.pop[id] = Math.max(2, capOf(id));
}

// Logistic growth toward each hex's cap: dP/dt = r * P * (1 - P/cap).
// Fractional population is stored; every reader floors for display. Growth
// only -- this function never lowers a number (loss belongs to the world's
// events, in later slices), so a hex above a shrunken cap simply holds.
// What the larder spent on growth LAST TICK, per second -- display only.
// Published by growPopulation so the ledger can show the TRUE food line
// (owner bug report, 2026-08-25 late: "+0.22/s" printed while the stock fell,
// because growth's spending was invisible to the rate). One source of truth:
// this is measured from the actual deduction, never re-derived.
export let growthSpendRate = 0;

export function growPopulation(dt) {
  growthSpendRate = 0;
  if (!S.map || !S.map.pop || !world) return;
  // No one is born during a famine: growth waits for the larder.
  if (S.res.food <= 0) return;
  const r = CONFIG.popGrowthRate;
  const before = hexPopSum();
  // What the larder can actually raise this tick. Growth is BOUGHT, not free
  // (CONFIG.growthFoodCost), so a thin surplus grows slowly and a full one
  // grows fast -- and a settlement that is only just feeding itself cannot
  // replace what a raid took.
  const perHead = CONFIG.growthFoodCost * (1 + (S.pop || 0) / CONFIG.growthCostPopScale);
  let budget = S.res.food / perHead;
  for (const id of S.map.owned) {
    const cap = capOf(id);
    if (cap <= 0) continue;
    let p = S.map.pop[id] || 0;
    // No rekindling: an emptied hex is not yours to repopulate any more, it is
    // unsettled ground you may claim again (loseHexIfEmpty above). The old
    // 0.2-soul revival died with rule 9 on 2026-08-25.
    if (p <= 0) continue;
    if (p >= cap) continue;
    if (budget <= 0) break;                       // the larder is spent for now
    let gain = r * p * (1 - p / cap) * dt;
    if (gain > budget) gain = budget;             // grow only what you can feed
    budget -= gain;
    S.res.food -= gain * perHead;
    growthSpendRate += (gain * perHead) / dt;
    const next = p + gain;
    // The logistic APPROACHES its cap and never attains it; snap the last
    // hundredth so a full hex eventually reads "8 of 8" instead of hovering
    // at 7 forever. (~7 minutes from the far side of the curve at r=0.015.)
    S.map.pop[id] = cap - next < 0.01 ? cap : next;
  }
  const after = hexPopSum();
  if (after !== before) {
    syncPopMirror();
    // Lifetime arrivals, for the game-over screen. Counted in WHOLE people
    // crossing an integer, so the stat matches what the Chronicle announced
    // rather than the fractional curve underneath it. (S.bought was declared
    // in E1 and never incremented until 2026-08-25 -- the end screen read
    // "Arrivals welcomed: 0" for every run ever played.)
    if (after > before) S.bought += Math.max(0, Math.floor(after) - Math.floor(before));
    // The Chronicle keeps its pulse: each whole arrival is told in the era's
    // own words -- but only while the settlement is SMALL. A hundred-soul
    // dominion gaining a person a second would drown the Chronicle in birth
    // announcements.
    if (after > before && after <= 25) log(active().arrivalLine, "good");
  }
}

// The era's scope (owner ruling, 2026-08-24): how many lands this age can
// hold, counting parties already on the road. No cost curve can brake what
// compounding production funds; the cap shuts the door outright, and the
// tech tree may later sell administrative capacity against it.
export function dominionCap() {
  return (active().map && active().map.dominionCap) || Infinity;
}
export function holdsUsed() {
  if (!S.map) return 0;
  return S.map.owned.length + S.buildQueue.filter((q) => q.kind === "settle").length;
}
export function atDominionCap() {
  return holdsUsed() >= dominionCap();
}

export function ownedTiles() { return S.map ? S.map.owned : []; }
export function isOwned(id) { return !!S.map && S.map.owned.includes(id); }

// ---------- The world strikes hexes (E5) ----------
// Sickness and raids stopped killing "someone, nowhere" -- they strike a HEX
// and kill people there. The two weightings are the two mitigation tracks:
// sickness is person-weighted (every soul equally at risk, so dense hexes
// host more fevers), raids are exposure-weighted (population x administrative
// distance -- the frontier is where the torches come).
export function strikeHex(kind) {
  if (!S.map || !S.map.pop || !world) return null;
  const weights = [];
  let total = 0;
  for (const id of S.map.owned) {
    const p = Math.floor(S.map.pop[id] || 0);
    if (p < 1) continue;
    const w = kind === "raid" ? p * (1 + adminDistance(id)) : p;
    weights.push([id, w]);
    total += w;
  }
  if (!total) return null;
  let roll = rng() * total;
  for (const [id, w] of weights) {
    if (roll < w) return id;
    roll -= w;
  }
  return weights[weights.length - 1][0];
}

// Kill n people at a hex. Returns how many actually died. Land is never
// lost; the mirror and the reservation books are settled immediately.
export function killAt(id, n) {
  if (!S.map || !S.map.pop || !(id in S.map.pop)) return 0;
  const before = Math.floor(S.map.pop[id]);
  const killed = Math.min(before, Math.max(0, Math.floor(n)));
  S.map.pop[id] = Math.max(0, S.map.pop[id] - killed);
  syncPopMirror();
  // A raid or a plague that takes the last person takes the ground with it --
  // the same rule famine follows, because losing ground is a property of the
  // hex being empty rather than of what emptied it.
  loseHexIfEmpty(id);
  return killed;
}

// WHAT THE EMPIRE COSTS TO HOLD, in mouths-equivalent.
//
// Every person eats `CONFIG.upkeep`; a person living FAR from the seat eats
// more, because getting anything to them costs more. The multiplier is
// `1 + upkeepPerDistance x adminDistance`, so the seat itself is at par and the
// frontier is dear.
//
// The shape is what matters, not the number: this makes upkeep grow with
// dominion SPREAD as well as size, which is the only way a sink outruns a
// per-capita source. A compact realm of forty is cheap; a stretched realm of
// forty is not. Geography becomes an economic decision rather than only a
// logistical one.
//
// The army is charged at par -- it lives with you, not out on the frontier --
// and returns as a plain headcount so callers that only want mouths still work.
export function upkeepMouths() {
  if (!S.map || !S.map.pop || !world) return 0;
  let mouths = 0;
  for (const id of S.map.owned) {
    const people = Math.floor(S.map.pop[id] || 0);
    if (people <= 0) continue;
    const d = adminDistance(id);
    const far = Number.isFinite(d) ? d : 0;
    mouths += people * (1 + CONFIG.upkeepPerDistance * far);
  }
  return mouths;
}

// ---------- Administrative distance & the famine drain (E4) ----------
// Two distances, and conflating them is the trap (map.md 2.7): routeCost()
// below measures from your NEAREST holding (logistics -- how long is the
// march); adminDistance() measures from your SEAT (administration -- how well
// can you hold it). A tendril of hexes is logistically close and
// administratively terrible, which is exactly what the famine drain punishes.
export function adminDistance(targetId) {
  if (!world || !S.map || !world.places[targetId]) return Infinity;
  const stepInto = (id) => {
    if (S.map.owned.includes(id)) return 0.5;
    return world.places[id].terrain === "water" ? 3 : 1;
  };
  const dist = {};
  const queue = [world.home];
  dist[world.home] = 0;
  while (queue.length) {
    let bi = 0;
    for (let i = 1; i < queue.length; i++) if (dist[queue[i]] < dist[queue[bi]]) bi = i;
    const id = queue.splice(bi, 1)[0];
    if (id === targetId) return dist[id];
    for (const n of world.places[id].adj) {
      const d = dist[id] + stepInto(n);
      if (dist[n] === undefined || d < dist[n]) {
        if (dist[n] === undefined) queue.push(n);
        dist[n] = d;
      }
    }
  }
  return dist[targetId] !== undefined ? dist[targetId] : Infinity;
}

// AN EMPTY HEX IS LOST (owner ruling, 2026-08-25, reversing rule 9).
//
// Ground used to stay yours when it emptied -- a ghost that rekindled from 0.2
// souls once the larder refilled, on the reasoning that "a ghost town you can
// bring back is more interesting than a hex that vanishes". The `dominionCap`
// shipped two days AFTER that ruling and changed its arithmetic: under a cap, a
// ghost occupies one of your seven slots while producing nothing, so you were
// punished twice and could not re-plan. Losing it frees the slot.
//
// What actually changed is narrower than it sounds. A ghost and a lost hex both
// yield nothing; the difference is FREE RECOVERY versus paying the claim again.
// So famine now costs the investment, not only the people -- which is the point:
// it punishes stretching yourself thin, or not watching a threat.
//
// It self-corrects rather than spiralling, because claim escalation reads
// `owned.length` (actions.js): losing ground makes the next claim CHEAPER.
//
// ONE function, called from every path that can empty a hex -- famine, sickness,
// a raid -- because "you lose ground when nobody is left on it" is a property of
// the ground being empty, not of what emptied it.
export function loseHexIfEmpty(id) {
  if (!S.map || !world || id === world.home) return false;   // the seat ends the run instead
  if (!S.map.owned.includes(id)) return false;
  if ((S.map.pop[id] || 0) >= 1) return false;

  const built = hexUse(id);
  S.map.owned = S.map.owned.filter((t) => t !== id);
  delete S.map.pop[id];
  setHexBuild(id, null);            // whatever stood here goes with the ground
  const noun = (active().map && active().map.tileNoun.singular) || "holding";
  // A structure is destroyed with the hex, and there is no refund -- the same
  // trade the deliberate demolish carries (design.md, Building on a Hex).
  if (built.kind === "structure") {
    log(`The last of them leave the ${noun}. What they built there is abandoned to the weather.`, "bad");
  } else {
    log(`The last of them leave the ${noun}. The ground is no longer yours.`, "bad");
  }
  syncPopMirror();
  syncDominion();
  return true;
}

// The famine drain: distance governs EXPOSURE, never efficiency. When the
// larder is empty, unpaid upkeep accumulates, and every `starveCost` worth of
// it kills one person at the peopled hex FURTHEST from the seat -- the empire
// starves from its frontier inward, and dies only when the seat itself empties.
// An emptied holding is LOST, not ghosted (see loseHexIfEmpty above).
let famineAnnounced = false;
export function starveTick(deficit, dt) {
  if (!S.map || !S.map.pop || !world) return false;
  S.map.starve = (S.map.starve || 0) + deficit * dt;
  if (!famineAnnounced) {
    famineAnnounced = true;
    log("Famine. The stores are empty, and the frontier feels it first.", "bad");
  }
  while (S.map.starve >= CONFIG.starveCost) {
    S.map.starve -= CONFIG.starveCost;
    // The victim: the peopled hex with the greatest administrative distance,
    // ties broken by id so the order is deterministic.
    let victim = null, worst = -1;
    for (const id of S.map.owned) {
      if ((S.map.pop[id] || 0) < 1) continue;
      const d = adminDistance(id);
      if (d > worst || (d === worst && victim !== null && id > victim)) { worst = d; victim = id; }
    }
    if (!victim) return true;   // no one left anywhere: the caller ends the run
    S.map.pop[victim] = Math.max(0, S.map.pop[victim] - 1);
    if (S.map.pop[victim] < 1) {
      S.map.pop[victim] = 0;
      if (victim === world.home) { syncPopMirror(); return true; }   // the seat is empty: the caller ends the run
      loseHexIfEmpty(victim);
    }
  }
  syncPopMirror();
  return false;
}

// Famine ends the moment the books balance again; the next one announces anew.
export function endFamine() { famineAnnounced = false; if (S.map) S.map.starve = 0; }

// Effective route cost from your dominion to a tile (the supply-route rule,
// user ruling): multi-source Dijkstra from every owned tile, where marching
// through your OWN country costs half a step, unowned land a full step, and
// water three -- slow crossings, never impossible, so an island seat can't
// deadlock a run. Conquering or settling a line toward a rival is literally
// building a road. Returns Infinity only when there is no map.
export function routeCost(targetId) {
  if (!world || !S.map || !world.places[targetId]) return Infinity;
  const stepInto = (id) => {
    if (S.map.owned.includes(id)) return 0.5;
    return world.places[id].terrain === "water" ? 3 : 1;
  };
  const dist = { };
  const queue = [];
  for (const id of S.map.owned) { dist[id] = 0; queue.push(id); }
  while (queue.length) {
    // Small worlds: a plain scan-for-min is simpler than a heap and fast
    // enough at a few hundred places.
    let bi = 0;
    for (let i = 1; i < queue.length; i++) if (dist[queue[i]] < dist[queue[bi]]) bi = i;
    const id = queue.splice(bi, 1)[0];
    if (id === targetId) return dist[id];
    for (const n of world.places[id].adj) {
      const d = dist[id] + stepInto(n);
      if (dist[n] === undefined || d < dist[n]) {
        if (dist[n] === undefined) queue.push(n);
        dist[n] = d;
      }
    }
  }
  return dist[targetId] !== undefined ? dist[targetId] : Infinity;
}

// How route cost bends a campaign: multiplies base march time and the food
// provision. Near targets (or well-roaded ones) march cheap; far ones cost.
// First-guess curve, tuned toward too-hard as always.
export function marchFactor(targetId) {
  const r = routeCost(targetId);
  if (!Number.isFinite(r)) return 1;   // no map (harness fixtures): par
  return Math.min(2, Math.max(0.6, 0.5 + r / 6));
}

// Capture: the tile becomes a holdfast of yours. One place, one rule --
// campaigns (subdue) and the settle verb both end here.
export function captureTile(id, viaSettle) {
  if (!world || !S.map || S.map.owned.includes(id)) return false;
  S.map.owned.push(id);
  delete S.map.minors[id];
  // New ground arrives BARE and starts working its own terrain at once --
  // no default to choose and nothing to forget to set.
  ensurePop();               // the new holding enters the books with its party
  syncPopMirror();           // S.pop is a MIRROR: recomputed here, never bumped
                             // by hand (a stray += 1 lived on this line until
                             // 2026-08-25, dead but misleading).
  syncCharted();              // taking ground shows you what borders it
  return true;
}

// The seat tile of an adversary, or null.
export function seatOf(advId) {
  if (!world) return null;
  for (const id in world.places) if (world.places[id].adversary === advId) return world.places[id];
  return null;
}
