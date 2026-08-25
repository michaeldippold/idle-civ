import { BRONZE_DELTA } from "./bronze.js";
import { IRON_DELTA } from "./iron.js";
import { EVENT_LIB, HINT_LIB } from "./lib.js";
import { STONE } from "./stone.js";
import { S } from "../core/state.js";
import { CONFIG } from "../core/config.js";

// ---------- Eras: the manifest model ------------------------
// Each era is a MANIFEST: the complete set of resources, jobs, buildings,
// upgrades, units, events and hints that exist while that era is active, plus
// a handful of era-scoped values (display name, housing per hut, panel titles,
// raid types). The engine reads ALL content through active() -- nothing below
// the compiler ever touches STONE or BRONZE_DELTA directly. If something is
// not in the active manifest, it does not exist right now: it can't fire,
// can't render, can't be built. Absence IS removal.
//
// Eras after the first are authored as DELTAS against their parent
// (remove / override / add) and compiled into full manifests at load. What a
// delta doesn't mention, it inherits unchanged -- with one deliberate
// exception: the `events` and `hints` slates are declared wholesale in every
// era, never inherited, because a forgotten event should be a loud authoring
// decision, not a silent omission. (This bit us once: events tagged for the
// wrong era simply stopped firing, with no error, ever.)
//
// Ids are permanent across eras -- saves, icons and DOM nodes key off them.
// Names, descs, costs and everything else are era-facts that live in the
// manifest, which is how a Hut becomes a Stone House without becoming a
// different thing. See tech.md for the full contract.
export const ERA_ORDER = ["stone", "bronze", "iron"];   // chronological; drives compilation and era comparisons

// ---------- Manifest compiler -------------------------------
// Compiles the authoring above into MANIFESTS at load. Every def is
// shallow-copied, so an override can never reach back and mutate the parent
// era's copy. Unknown ids in remove/override, duplicate ids in add, unknown
// slate entries, and a missing events/hints slate all THROW -- at load,
// before a single frame renders. Silent wrongness from a dangling id is this
// game's signature bug class; the compiler's job is to convert it into a
// loud one. (Phase B adds a full cross-reference validator on top.)
// "jobs" left this list in E2: the category has no defs anywhere any more.
export const DEF_CATEGORIES = ["resources", "buildings", "upgrades", "units"];

export function resolveSlates(m, raw) {
  if (!raw.events) throw new Error(`era "${m.name}": missing events slate (slates are never inherited)`);
  if (!raw.hints)  throw new Error(`era "${m.name}": missing hints slate (slates are never inherited)`);
  m.events = raw.events.map((id) => {
    if (!EVENT_LIB[id]) throw new Error(`era "${m.name}": unknown event "${id}" in slate`);
    return Object.assign({ id }, EVENT_LIB[id]);
  });
  m.hints = raw.hints.map((id) => {
    if (!HINT_LIB[id]) throw new Error(`era "${m.name}": unknown hint "${id}" in slate`);
    return Object.assign({ id }, HINT_LIB[id]);
  });
}

// The map spec is an era-fact with structure, so it gets a real copy.
function copyMapSpec(m) {
  return {
    tileNoun: Object.assign({}, m.tileNoun),
    terrains: m.terrains.slice(),
    seats: (m.seats || []).slice(),
    yields: m.yields ? JSON.parse(JSON.stringify(m.yields)) : null,
    popCaps: m.popCaps ? Object.assign({}, m.popCaps) : null,
    claim: m.claim ? JSON.parse(JSON.stringify(m.claim)) : null,
    dominionCap: m.dominionCap || null,
    minors: m.minors ? JSON.parse(JSON.stringify(m.minors)) : null,
  };
}

// Each adversary names its own ground in its own description, and the
// GENERATOR needs that where it looks: the generator is handed the map spec,
// not the whole manifest, so the seat->terrain lookup is folded in here.
// (Placement read `spec.adversaries` for one commit and silently found
// nothing, seating everyone at random -- the harness caught it as 30 seats
// on their own ground out of 90, which is exactly chance.)
function attachSeatTerrain(m) {
  if (!m.map) return m;
  const t = {};
  for (const a of m.adversaries || []) if (a.homeTerrain) t[a.id] = a.homeTerrain;
  m.map.seatTerrain = t;
  return m;
}

export function compileBase(raw) {
  const m = {
    name: raw.name,
    panelTitles: Object.assign({}, raw.panelTitles),
    popNoun: Object.assign({}, raw.popNoun),
    arrivalLine: raw.arrivalLine,
    // Growth-model era-facts (phase 6b). All three inherit, like popNoun:
    // an era that says nothing keeps its parent's model.
    // `allocation` retired 2026-08-23 (engine rework E2): every era allocates
    // hexes. `outputMult` retired with it -- it existed to compensate
    // tile-count-as-population, and population is real now.

    raidTypes: raw.raidTypes.slice(),
    migrations: [],   // a base era is never entered FROM anywhere
    // (`consolidate` retired 2026-08-25: applyConsolidation died in E5 and its
    // last caller went with it. Declaring one is now a load error -- see the
    // validator -- rather than a field nothing reads.)
    // Wholesale like the slates, never inherited: each age's world arrives
    // fresh, with fresh stocks, by construction.
    adversaries: (raw.adversaries || []).map((a) => Object.assign({}, a)),
    // What this age can DO about its neighbours, either direction. "none"
    // means no one exists who could send or receive a war -- see stone.js.
    contact: raw.contact || "none",
    // THE ODOMETER (design.md, The Noun Table): how many real beings one unit
    // of hex population stands for in this age. It scales the TOPLINE number
    // only -- never a cost, cap, rate, requirement or stepper, which is rule 1
    // and the thing that keeps this flavour rather than a second economy.
    // Inherits, like popNoun: an age that does not re-denominate keeps its
    // parent's scale.
    soulsPerPerson: raw.soulsPerPerson != null ? raw.soulsPerPerson : 1,
    // WHAT CAN BE BUILT ON A HEX (design.md, Building on a Hex). Inherits like
    // popNoun: an age that says nothing keeps what it could already raise, so a
    // farm learned in Bronze is still a farm in Iron.
    structures: (raw.structures || []).map((d) => Object.assign({}, d)),
    // The building a column gathers at, and how many it can carry.
    muster: raw.muster ? Object.assign({}, raw.muster) : null,
    // The map spec INHERITS, like popNoun -- deliberately, because the map
    // regenerates only when the tile noun changes (design.md, Scale: The
    // Tile Ladder). An era that keeps the noun keeps the world; an era that
    // redeclares the spec recuts it. No spec (Stone) means no map.
    map: raw.map ? copyMapSpec(raw.map) : null,
  };
  for (const cat of DEF_CATEGORIES) m[cat] = (raw[cat] || []).map((d) => Object.assign({}, d));
  resolveSlates(m, raw);
  return attachSeatTerrain(m);
}

export function extendEra(parent, delta) {
  const m = {
    name: delta.name || parent.name,
    panelTitles: Object.assign({}, parent.panelTitles, delta.panelTitles),
    // The population noun inherits (Silicon keeps Bloc); an era that
    // re-denominates simply declares a new one.
    popNoun: delta.popNoun ? Object.assign({}, delta.popNoun) : parent.popNoun,
    arrivalLine: delta.arrivalLine || parent.arrivalLine,


    raidTypes: delta.raidTypes ? delta.raidTypes.slice() : parent.raidTypes,
    // Explicit state-migration instructions, run once when this era is
    // ENTERED (see runEraMigrations). Never inherited: a migration describes
    // one specific transition, not a standing rule.
    migrations: (delta.migrations || []).slice(),
    adversaries: (delta.adversaries || []).map((a) => Object.assign({}, a)),
    contact: delta.contact || parent.contact,
    soulsPerPerson: delta.soulsPerPerson != null ? delta.soulsPerPerson : parent.soulsPerPerson,
    structures: delta.structures
      ? delta.structures.map((d) => Object.assign({}, d))
      : parent.structures.map((d) => Object.assign({}, d)),
    muster: delta.muster !== undefined
      ? (delta.muster ? Object.assign({}, delta.muster) : null)
      : (parent.muster ? Object.assign({}, parent.muster) : null),
    // COPIED, never shared. Inheriting the parent's map object by reference
    // meant a child could reach back and mutate its parent's spec -- and one
    // did: attachSeatTerrain() below writes onto m.map, so a silent delta
    // (an era that redeclares no map) overwrote IRON's seat terrain with its
    // own empty one, and every adversary went back to being seated at random.
    // The harness caught it as 30 seats on their own ground out of 90, which
    // is precisely chance. Inheritance by value reads identically and cannot
    // do this.
    map: delta.map ? copyMapSpec(delta.map) : (parent.map ? copyMapSpec(parent.map) : null),
  };
  const removes = new Set(delta.remove || []);
  const overrides = delta.override || {};
  const touched = new Set();   // remove/override targets actually found in the parent

  for (const cat of DEF_CATEGORIES) {
    const list = [];
    for (const d of parent[cat]) {
      if (removes.has(d.id)) { touched.add(d.id); continue; }
      const copy = Object.assign({}, d);
      if (overrides[d.id]) { Object.assign(copy, overrides[d.id]); touched.add(d.id); }
      list.push(copy);
    }
    for (const d of (delta.add && delta.add[cat]) || []) {
      if (list.some((x) => x.id === d.id)) throw new Error(`era "${m.name}": add duplicates id "${d.id}"`);
      list.push(Object.assign({}, d));
    }
    m[cat] = list;
  }

  for (const id of removes) if (!touched.has(id)) throw new Error(`era "${m.name}": removes unknown id "${id}"`);
  for (const id in overrides) if (!touched.has(id)) throw new Error(`era "${m.name}": overrides unknown id "${id}"`);
  resolveSlates(m, delta);
  return attachSeatTerrain(m);
}

export const MANIFESTS = { stone: compileBase(STONE) };
MANIFESTS.bronze = extendEra(MANIFESTS.stone, BRONZE_DELTA);
MANIFESTS.iron = extendEra(MANIFESTS.bronze, IRON_DELTA);

// Latest-era def for every buildable id that has EVER existed, so things that
// can outlive an era hop -- queue entries, log lines about them -- still
// resolve after their def leaves the active manifest. Later eras overwrite
// earlier ones, so an id reads with its most recent identity.
export const DEF_INDEX = {};
for (const era of ERA_ORDER) {
  for (const cat of ["buildings", "upgrades", "units"]) {
    for (const d of MANIFESTS[era][cat]) DEF_INDEX[d.id] = d;
  }
}

// ---------- The roster is the same board in every age -------------------
// WHO exists is decided once, at generation; era decides only what they are
// called and how strong they are. Three numbers make that true, and all three
// are silent when wrong -- a drifted density or a resized name pool relocates
// every steading in every existing world, and a changed seat list reseats the
// powers. Nothing downstream would report it; you would simply find your
// neighbours somewhere else after an era flip. So it is asserted at LOAD.
{
  const withMaps = ERA_ORDER.filter((e) => MANIFESTS[e].map);
  const ref = withMaps[0];
  for (const era of withMaps) {
    const a = MANIFESTS[ref].map, b = MANIFESTS[era].map;
    if ((a.seats || []).join(",") !== (b.seats || []).join(",")) {
      throw new Error(`[manifest] ${era}: seats differ from ${ref}. The roster is fixed at generation -- every era must seat the same powers.`);
    }
    const am = a.minors, bm = b.minors;
    if (!am !== !bm) {
      throw new Error(`[manifest] ${era}: declares a minor tier and ${ref} does not (or vice versa). Sites exist in every age or none.`);
    }
    if (am && bm) {
      if (am.density !== bm.density) {
        throw new Error(`[manifest] ${era}: minor density ${bm.density} differs from ${ref}'s ${am.density}. Density is the per-hex placement roll -- changing it moves every steading.`);
      }
      if (am.names.length !== bm.names.length) {
        throw new Error(`[manifest] ${era}: minor name pool has ${bm.names.length} entries, ${ref} has ${am.names.length}. The pool's LENGTH caps and orders placement.`);
      }
      if (!bm.form || bm.form.indexOf("%s") < 0) {
        throw new Error(`[manifest] ${era}: minors.form must contain %s (the place name). Got ${JSON.stringify(bm.form)}.`);
      }
    }
  }
  // Majors strictly outrank minors WITHIN an age -- otherwise the two words
  // describe nothing (owner ruling, 2026-08-24).
  for (const era of withMaps) {
    const m = MANIFESTS[era];
    if (!m.map.minors || !m.adversaries.length) continue;
    const ceiling = m.map.minors.strength[1];
    for (const a of m.adversaries) {
      if (a.strength <= ceiling) {
        throw new Error(`[manifest] ${era}: major "${a.id}" at strength ${a.strength} does not outrank the minor band (max ${ceiling}).`);
      }
    }
  }
}

// THE indirection: every engine and render read of content goes through here.
// The stone fallback is defensive only (a hand-edited save with a bogus era).
export function active() { return MANIFESTS[S.era] || MANIFESTS.stone; }

// (BOOST_BUILDING died here 2026-08-25 with the hex economy. It mapped a
// resource to the panel building that lifted its rate kingdom-wide -- food to
// the Drying Racks, wood to the Lumber Camp, stone to the Stone Pit. All three
// went onto the board as STRUCTURES standing on the ground they improve, where
// a rival can see them and take them, so a global multiplier keyed by building
// id has nothing left to point at.)

// ---------- Manifest validator ------------------------------
// The cross-reference pass, run at load against every compiled manifest: any
// id one piece of content uses to point at another must resolve WITHIN that
// same era. This is what makes removal safe to author -- retire a resource
// and every cost, recipe, storage building and job that still mentions it
// turns into a load-time error instead of NaN production, a converter that
// silently never runs, or a cap that quietly stops applying.
//
// Honest limit: reveal() predicates are arbitrary code and can't be
// statically validated. A stale reference there yields a hint or card that
// never appears -- annoying, but it cannot break the economy.
export function validateManifests(manifests) {
  const problems = [];
  for (const era in manifests) {
    const m = manifests[era];
    const resIds = new Set(m.resources.map((r) => r.id));
    const buildIds = new Set(m.buildings.map((b) => b.id));
    const raidIds = new Set(m.raidTypes.map((r) => r.id));
    const bad = (msg) => problems.push(`[${era}] ${msg}`);

    // Every mapped era must say what its ground yields. ONE RESOURCE PER
    // TERRAIN since 2026-08-25: a forest makes wood, and that is the whole
    // entry. An era that still declares the old `works` matrix is a load
    // error rather than a table nothing reads.
    if (m.map && !m.map.yields) bad("a mapped era needs map.yields (what each terrain yields)");
    if (m.map && m.map.works) bad("map.works is retired (2026-08-25) -- declare map.yields, one resource per terrain");


    if (m.map) {
      // `view` (the era render radius) was retired 2026-08-22 with one board,
      // forever. A manifest still carrying one is a leftover, and a silently
      // ignored era-fact is exactly the kind of wrongness this validator exists
      // to refuse.
      if (m.map.view != null) {
        bad("map.view is retired -- one board, forever; fog decides what is seen");
      }
      if (!m.map.tileNoun || !m.map.tileNoun.singular || !m.map.tileNoun.plural) bad("map tileNoun needs singular and plural");
      if (!Array.isArray(m.map.terrains) || !m.map.terrains.length) bad("map declares no terrains");
      // Engine rework E1: a mapped era must say how many people its ground
      // holds. Water is exempt (no one lives on open water; absent = 0).
      if (m.map.minors && !(m.map.minors.density > 0 && m.map.minors.density < 1)) {
        bad("map.minors needs a density in (0,1) -- neighbours scale with the world (slice 4c)");
      }
      for (const a of m.adversaries) {
        if (a.homeTerrain && !m.map.terrains.includes(a.homeTerrain)) {
          bad(`adversary ${a.id} prefers "${a.homeTerrain}", not a terrain this era has`);
        }
      }
      if (!m.map.popCaps) bad("map declares no popCaps -- terrain must say how many people it holds");
      // E3: growth is claiming, so a mapped era must price the claim verb.
      if (!m.map.claim || !m.map.claim.cost || !(m.map.claim.time > 0)) {
        bad("map declares no claim spec -- expansion is the growth verb and must be priced");
      }
      // The dominion cap is the era's scope (owner ruling 2026-08-24): what
      // one age can hold. Required, and it must at least fit the trio.
      if (!(m.map.dominionCap >= 3)) bad("map declares no dominionCap (or one smaller than the starting trio)");
      else for (const t of m.map.terrains) {
        if (t === "water") continue;
        if (!(m.map.popCaps[t] > 0)) bad(`popCaps missing or non-positive for terrain "${t}"`);
      }
      const advIds = new Set(m.adversaries.map((a) => a.id));
      for (const seat of m.map.seats) {
        if (!advIds.has(seat)) bad(`map seats unknown adversary "${seat}"`);
      }
      if (m.map.minors) {
        const mn = m.map.minors;
        // `count` retired in slice 4c: neighbours are seeded by DENSITY, so
        // the pool is the ceiling on how many can exist -- and a nameless
        // people would be a generated adversary, which the law forbids.
        if (!Array.isArray(mn.names) || mn.names.length < 4) {
          bad("map.minors needs a hand-authored name pool (at least four)");
        }
        for (const r in mn.stock || {}) if (!resIds.has(r)) bad(`minors stock "${r}", not a resource this era`);
      }
      for (const t in m.map.yields || {}) {
        const y = m.map.yields[t];
        if (!m.map.terrains.includes(t)) bad(`map.yields keys unknown terrain "${t}"`);
        if (!y || typeof y.res !== "string") bad(`terrain "${t}" yields no named resource`);
        else if (!resIds.has(y.res)) bad(`terrain "${t}" yields "${y.res}", not a resource this era`);
        if (!(y && y.rate > 0)) bad(`terrain "${t}" yields at a non-positive rate`);
      }
    }

    for (const cat of ["buildings", "upgrades", "units"]) {
      for (const d of m[cat]) {
        if (!d.id || !d.name || !d.kind) bad(`${cat} entry ${d.id || "?"} missing id/name/kind`);
        if (typeof d.reveal !== "function") bad(`${d.id} has no reveal()`);
        for (const k in d.base || {}) {
          if (!resIds.has(k)) bad(`${d.id} costs "${k}", not a resource this era`);
        }
        if (d.converts) {
          for (const k in d.converts.in)  if (!resIds.has(k)) bad(`${d.id} converts from "${k}", not a resource this era`);
          for (const k in d.converts.out) if (!resIds.has(k)) bad(`${d.id} converts to "${k}", not a resource this era`);
        }
      }
    }
    for (const r of m.resources) {
      if (r.capBuilding !== undefined) {
        // A capBuilding would be a silent no-op now -- caps() stopped reading
        // it in 4c -- and a manifest field nothing reads is a lie in waiting.
        bad(`resource ${r.id} declares capBuilding -- retired in 4c (2026-08-25): caps are flat and era-authored`);
      }
    }
    // Structures: where they may stand, what they yield, and what unlocks
    // them all have to resolve INSIDE this era, same rule as everything else.
    for (const st of m.structures || []) {
      for (const t of st.terrain || []) {
        if (!m.map || !m.map.terrains.includes(t)) bad(`structure ${st.id} may stand on "${t}", not a terrain this era`);
      }
      if (st.yield && !resIds.has(st.yield.res)) bad(`structure ${st.id} yields "${st.yield.res}", not a resource this era`);
      if (st.yield && !(st.yield.rate > 0)) bad(`structure ${st.id} yields at a non-positive rate`);
      if (st.requires && !m.upgrades.some((u) => u.id === st.requires)) {
        bad(`structure ${st.id} requires "${st.requires}", not an upgrade this era`);
      }
    }
    for (const u of m.units) {
      if (u.counters && !raidIds.has(u.counters)) bad(`unit ${u.id} counters "${u.counters}", not a raid type this era`);
    }
    for (const ev of m.events) {
      if (ev.counter && !buildIds.has(ev.counter.building)) {
        bad(`event ${ev.id} countered by "${ev.counter.building}", not a building this era`);
      }
    }
    for (const ins of m.migrations) {
      if (!ins.bucket || !(ins.bucket in { res: 1, jobs: 1, builds: 1, units: 1, upgrades: 1 })) {
        bad(`migration targets unknown bucket "${ins.bucket}"`);
      }
      if (!ins.vanish && !ins.convertTo && !ins.fn) bad(`migration for ${ins.id} has no primitive (vanish/convertTo/fn)`);
    }
    for (const st of m.structures || []) {
      if (!st.id || !st.name) bad(`a structure is missing id or name`);
      if (!st.base) bad(`structure "${st.id}" has no cost`);
      if (!(st.buildTime > 0)) bad(`structure "${st.id}" has no build time`);
      // The unlock must be a real upgrade in SOME era, or the structure is
      // unreachable and nobody finds out until a playthrough that never offers it.
      if (st.requires) {
        const known = Object.values(manifests).some((mm) =>
          (mm.upgrades || []).some((u) => u.id === st.requires));
        if (!known) bad(`structure "${st.id}" requires unknown upgrade "${st.requires}"`);
      }
      if (st.yield) {
        if (!m.resources.some((r) => r.id === st.yield.res)) {
          bad(`structure "${st.id}" yields "${st.yield.res}", which this era has no resource for`);
        }
        if (!(st.yield.rate > 0)) bad(`structure "${st.id}" yields at a non-positive rate`);
      }
    }
    if (!(typeof m.soulsPerPerson === "number" && m.soulsPerPerson >= 1)) {
      bad(`soulsPerPerson must be a number >= 1 (got ${m.soulsPerPerson})`);
    }
    // The person-noun and the tile-noun must never be the same word. They were
    // at Iron -- both "holdfast" -- which is how the POP tooltip came to read
    // "every holdfast counted here stands on one of your 20 hexes". design.md
    // refereed this fight once already (Scale: The Tile Ladder); a validator is
    // cheaper than refereeing it again.
    if (m.map && m.map.tileNoun && m.popNoun &&
        m.popNoun.singular === m.map.tileNoun.singular) {
      bad(`popNoun and tileNoun are the same word ("${m.popNoun.singular}") -- one names a mass of people, the other a place`);
    }
    if (!m.popNoun || typeof m.popNoun.singular !== "string" || typeof m.popNoun.plural !== "string") {
      bad(`missing or malformed popNoun`);
    }
    if (!m.arrivalLine) bad(`missing arrivalLine`);
    if (m.consolidate !== undefined) {
      // Consolidation died in E5 and its caller on 2026-08-25. A manifest that
      // declares one would take population at a border with nothing left to
      // execute it -- silently, which is the failure mode this compiler exists
      // to convert into a loud one.
      bad(`era declares consolidate -- retired 2026-08-25: borders re-denominate, they never take`);
    }
    for (const a of m.adversaries) {
      if (!a.id || !a.name || !a.disposition || !(a.strength > 0)) bad(`adversary ${a.id || "?"} missing id/name/disposition/strength`);
      if (a.walls != null && !(a.walls >= 0)) bad(`adversary ${a.id} has malformed walls`);
      if (a.fightsAs && !raidIds.has(a.fightsAs)) bad(`adversary ${a.id} fights as "${a.fightsAs}", not a raid type this era`);
      if (!(a.campaignTime > 0)) bad(`adversary ${a.id} has no campaignTime`);
      for (const k in a.stock || {}) if (!resIds.has(k)) bad(`adversary ${a.id} stocks "${k}", not a resource this era`);
      if (a.buys) {
        if (a.disposition !== "peaceful") bad(`adversary ${a.id} trades but is not peaceful`);
        if (!resIds.has(a.buys.res)) bad(`adversary ${a.id} buys "${a.buys.res}", not a resource this era`);
        if (!(a.buys.amount > 0) || !(a.buys.pays > 0)) bad(`adversary ${a.id} has a malformed exchange`);
        if (!(a.caravanTime > 0)) bad(`adversary ${a.id} trades but has no caravanTime`);
      }
    }
  }
  if (problems.length) throw new Error("Manifest validation failed:\n  " + problems.join("\n  "));
}
validateManifests(MANIFESTS);

// What one era-step changes among the buildable categories, computed from the
// compiled manifests so it can never go stale. Feeds the era modal AND the
// DOM purge -- one diff, two consumers.
export function manifestDiff(fromM, toM) {
  const diff = { added: [], removed: [], renamed: [] };
  for (const cat of ["buildings", "units", "upgrades"]) {
    for (const d of toM[cat]) {
      const prev = fromM && fromM[cat].find((p) => p.id === d.id);
      if (!prev) diff.added.push(d);
      else if (prev.name !== d.name) diff.renamed.push({ from: prev, to: d });
    }
    if (fromM) {
      for (const d of fromM[cat]) {
        if (!toM[cat].some((p) => p.id === d.id)) diff.removed.push(d);
      }
    }
  }
  return diff;
}

